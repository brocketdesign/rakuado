const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const ensureAuthenticated = require('../../middleware/authMiddleware');

const GA_SCOPES = [
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/analytics.edit',
];

function createOAuth2Client(callbackURL) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    callbackURL
  );
}

function getCallbackURL(req) {
  const protocol = req.protocol;
  const host = req.get('host').replace('192.168.10.115', 'localhost');
  return `${protocol}://${host}/api/ga/callback`;
}

async function getAuthClient() {
  const db = global.db;
  const settings = await db.collection('gaSettings').findOne({ type: 'global' });
  if (!settings || !settings.accessToken) return null;

  const oauth2Client = createOAuth2Client(
    process.env.GOOGLE_GA_CALLBACK_URL || 'http://localhost:3000/api/ga/callback'
  );
  oauth2Client.setCredentials({
    access_token: settings.accessToken,
    refresh_token: settings.refreshToken,
    expiry_date: settings.tokenExpiry,
  });

  // Persist refreshed tokens to DB
  oauth2Client.on('tokens', async (tokens) => {
    const update = { tokenExpiry: tokens.expiry_date };
    if (tokens.access_token) update.accessToken = tokens.access_token;
    if (tokens.refresh_token) update.refreshToken = tokens.refresh_token;
    await global.db.collection('gaSettings').updateOne(
      { type: 'global' },
      { $set: update }
    );
  });

  return oauth2Client;
}

// GET /api/ga/auth — initiate OAuth flow
router.get('/auth', ensureAuthenticated, (req, res) => {
  const callbackURL = getCallbackURL(req);
  const oauth2Client = createOAuth2Client(callbackURL);
  const baseUrl = `${req.protocol}://${req.get('host').replace('192.168.10.115', 'localhost')}`;

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: GA_SCOPES,
    prompt: 'consent',
    state: Buffer.from(baseUrl).toString('base64'),
  });

  res.json({ url: authUrl });
});

// GET /api/ga/callback — OAuth callback
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect('/dashboard/google-analytics?error=access_denied');
  }

  const db = global.db;

  try {
    const callbackURL = getCallbackURL(req);
    const oauth2Client = createOAuth2Client(callbackURL);

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Fetch connected email
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    await db.collection('gaSettings').updateOne(
      { type: 'global' },
      {
        $set: {
          type: 'global',
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiry: tokens.expiry_date,
          connectedAt: new Date(),
          connectedEmail: userInfo.data.email,
        },
      },
      { upsert: true }
    );

    // Decode base URL from state
    let baseUrl = '/';
    try {
      baseUrl = Buffer.from(state, 'base64').toString('utf8');
    } catch (_) {}

    res.redirect(`${baseUrl}/dashboard/google-analytics?connected=true`);
  } catch (err) {
    console.error('GA OAuth callback error:', err);
    res.redirect('/dashboard/google-analytics?error=oauth_failed');
  }
});

// GET /api/ga/status — check connection status
router.get('/status', ensureAuthenticated, async (req, res) => {
  try {
    const db = global.db;
    const settings = await db.collection('gaSettings').findOne({ type: 'global' });

    if (!settings || !settings.accessToken) {
      return res.json({ connected: false });
    }

    res.json({
      connected: true,
      connectedEmail: settings.connectedEmail,
      connectedAt: settings.connectedAt,
      mainSitePropertyId: settings.mainSitePropertyId || '',
      mainSiteUrl: settings.mainSiteUrl || '',
    });
  } catch (err) {
    console.error('GA status error:', err);
    res.status(500).json({ error: 'Failed to get GA status' });
  }
});

// GET /api/ga/properties — list all GA4 properties available to the connected account
router.get('/properties', ensureAuthenticated, async (req, res) => {
  try {
    const auth = await getAuthClient();
    if (!auth) return res.status(401).json({ error: 'GA not connected' });

    const analyticsadmin = google.analyticsadmin({ version: 'v1beta', auth });
    const accountsRes = await analyticsadmin.accountSummaries.list();

    const properties = [];
    for (const account of accountsRes.data.accountSummaries || []) {
      for (const prop of account.propertySummaries || []) {
        properties.push({
          accountName: account.displayName,
          propertyId: prop.property, // e.g. "properties/12345678"
          displayName: prop.displayName,
        });
      }
    }

    res.json({ properties });
  } catch (err) {
    console.error('GA properties error:', err);
    res.status(500).json({ error: 'Failed to list properties' });
  }
});

// GET /api/ga/data — fetch analytics data for all connected sites
router.get('/data', ensureAuthenticated, async (req, res) => {
  const { startDate = '28daysAgo', endDate = 'today', propertyId } = req.query;

  try {
    const auth = await getAuthClient();
    if (!auth) return res.status(401).json({ error: 'GA not connected' });

    const db = global.db;
    const analyticsdata = google.analyticsdata({ version: 'v1beta', auth });
    const settings = await db.collection('gaSettings').findOne({ type: 'global' });
    const partners = await db.collection('partners')
      .find({ gaPropertyId: { $exists: true, $ne: '' } })
      .toArray();

    const sites = [];

    // Add main site if configured
    if (settings?.mainSitePropertyId) {
      sites.push({
        name: settings.mainSiteUrl || 'Main Site',
        domain: settings.mainSiteUrl || '',
        propertyId: settings.mainSitePropertyId,
        type: 'main',
      });
    }

    // Add partner sites
    for (const partner of partners) {
      if (partner.gaPropertyId) {
        sites.push({
          name: partner.name,
          domain: partner.domain || '',
          propertyId: partner.gaPropertyId,
          type: 'partner',
          partnerId: partner._id.toString(),
        });
      }
    }

    // Filter to a specific property if requested
    const targetSites = propertyId
      ? sites.filter((s) => s.propertyId === propertyId)
      : sites;

    if (targetSites.length === 0) {
      return res.json({ sites: [], totals: { users: 0, pageviews: 0 } });
    }

    // Query GA Data API for each site in parallel
    const results = await Promise.all(
      targetSites.map(async (site) => {
        try {
          const report = await analyticsdata.properties.runReport({
            property: site.propertyId,
            requestBody: {
              dateRanges: [{ startDate, endDate }],
              dimensions: [{ name: 'date' }],
              metrics: [
                { name: 'activeUsers' },
                { name: 'screenPageViews' },
              ],
              orderBys: [{ dimension: { dimensionName: 'date' } }],
            },
          });

          const rows = report.data.rows || [];
          const dailyData = rows.map((row) => ({
            date: row.dimensionValues[0].value,
            users: parseInt(row.metricValues[0].value, 10) || 0,
            pageviews: parseInt(row.metricValues[1].value, 10) || 0,
          }));

          const totalUsers = dailyData.reduce((s, d) => s + d.users, 0);
          const totalPageviews = dailyData.reduce((s, d) => s + d.pageviews, 0);

          return { ...site, dailyData, totalUsers, totalPageviews };
        } catch (err) {
          console.error(`GA fetch error for ${site.propertyId}:`, err.message);
          return { ...site, dailyData: [], totalUsers: 0, totalPageviews: 0, error: err.message };
        }
      })
    );

    const totals = {
      users: results.reduce((s, r) => s + r.totalUsers, 0),
      pageviews: results.reduce((s, r) => s + r.totalPageviews, 0),
    };

    res.json({ sites: results, totals });
  } catch (err) {
    console.error('GA data fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch GA data' });
  }
});

// PUT /api/ga/settings — update main site GA property
router.put('/settings', ensureAuthenticated, async (req, res) => {
  const { mainSitePropertyId, mainSiteUrl } = req.body;

  try {
    const db = global.db;
    await db.collection('gaSettings').updateOne(
      { type: 'global' },
      { $set: { mainSitePropertyId: mainSitePropertyId || '', mainSiteUrl: mainSiteUrl || '', updatedAt: new Date() } },
      { upsert: true }
    );
    res.json({ success: true });
  } catch (err) {
    console.error('GA settings update error:', err);
    res.status(500).json({ error: 'Failed to update GA settings' });
  }
});

// DELETE /api/ga/disconnect — revoke and remove stored tokens
router.delete('/disconnect', ensureAuthenticated, async (req, res) => {
  try {
    const db = global.db;
    await db.collection('gaSettings').updateOne(
      { type: 'global' },
      {
        $unset: { accessToken: '', refreshToken: '', tokenExpiry: '', connectedEmail: '' },
        $set: { disconnectedAt: new Date() },
      }
    );
    res.json({ success: true });
  } catch (err) {
    console.error('GA disconnect error:', err);
    res.status(500).json({ error: 'Failed to disconnect GA' });
  }
});

module.exports = router;
