const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { ObjectId } = require('mongodb');
const ensureAuthenticated = require('../../middleware/authMiddleware');

const RAKUBUN_BASE_URL = process.env.RAKUBUN_BASE_URL || 'https://rakubun.vercel.app';
const RAKUADO_CLIENT_ID = process.env.RAKUADO_CLIENT_ID || 'rakuado';
const RAKUADO_CLIENT_SECRET = process.env.RAKUADO_CLIENT_SECRET;

// All routes require a logged-in Rakuado user
router.use(ensureAuthenticated);

// ─── GET /api/rakubun/connect ─────────────────────────────────────────────────
// Generates a CSRF state token and redirects the user to Rakubun's OAuth consent page.
// If the user doesn't have a Rakubun account they can sign up there.

router.get('/connect', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  req.session.rakubunOAuthState = state;

  const callbackUrl = `${req.protocol}://${req.get('host')}/api/rakubun/callback`;

  const params = new URLSearchParams({
    client_id: RAKUADO_CLIENT_ID,
    redirect_uri: callbackUrl,
    state,
  });

  return res.redirect(`${RAKUBUN_BASE_URL}/oauth/authorize?${params.toString()}`);
});

// ─── GET /api/rakubun/callback ────────────────────────────────────────────────
// OAuth callback: validate state, exchange code for access token, store on user.

router.get('/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error === 'access_denied') {
      return res.redirect('/dashboard/rakubun?rakubun=denied');
    }

    if (!state || state !== req.session.rakubunOAuthState) {
      return res.status(400).send('Invalid OAuth state. Please try connecting again.');
    }

    // Clear the state immediately (one-time use)
    delete req.session.rakubunOAuthState;

    if (!code) {
      return res.status(400).send('Missing authorization code.');
    }

    const callbackUrl = `${req.protocol}://${req.get('host')}/api/rakubun/callback`;

    const tokenRes = await fetch(`${RAKUBUN_BASE_URL}/api/oauth?_action=token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: RAKUADO_CLIENT_ID,
        client_secret: RAKUADO_CLIENT_SECRET,
        code,
        redirect_uri: callbackUrl,
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('[Rakubun OAuth] Token exchange failed:', tokenData);
      return res.redirect('/dashboard?rakubun=error');
    }

    const db = global.db;
    await db.collection('users').updateOne(
      { _id: new ObjectId(req.user._id) },
      {
        $set: {
          rakubunApiKey: tokenData.access_token,
          rakubunConnectedAt: new Date(),
        },
      },
    );

    return res.redirect('/dashboard/rakubun?rakubun=connected');
  } catch (err) {
    console.error('[Rakubun OAuth] Callback error:', err);
    return res.redirect('/dashboard/rakubun?rakubun=error');
  }
});

// ─── GET /api/rakubun/data ────────────────────────────────────────────────────
// Returns Rakubun summary stats for the current user. Frontend calls this.

router.get('/data', async (req, res) => {
  try {
    const db = global.db;
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.user._id) });

    if (!user?.rakubunApiKey) {
      return res.status(404).json({ connected: false });
    }

    const dataRes = await fetch(`${RAKUBUN_BASE_URL}/api/agent?_action=summary`, {
      headers: { 'X-API-Key': user.rakubunApiKey },
    });

    if (dataRes.status === 401) {
      // Key was revoked on the Rakubun side — clear it
      await db.collection('users').updateOne(
        { _id: new ObjectId(req.user._id) },
        { $unset: { rakubunApiKey: '', rakubunConnectedAt: '' } },
      );
      return res.status(401).json({ connected: false, error: 'Rakubun connection was revoked' });
    }

    if (!dataRes.ok) {
      return res.status(502).json({ connected: true, error: 'Failed to reach Rakubun' });
    }

    const data = await dataRes.json();
    return res.status(200).json({ connected: true, ...data });
  } catch (err) {
    console.error('[Rakubun] /data error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/rakubun/sites ───────────────────────────────────────────────────
// Returns the user's Rakubun sites list.

router.get('/sites', async (req, res) => {
  try {
    const db = global.db;
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.user._id) });

    if (!user?.rakubunApiKey) {
      return res.status(404).json({ connected: false });
    }

    const sitesRes = await fetch(`${RAKUBUN_BASE_URL}/api/agent?_action=sites`, {
      headers: { 'X-API-Key': user.rakubunApiKey },
    });

    if (!sitesRes.ok) {
      return res.status(502).json({ error: 'Failed to reach Rakubun' });
    }

    const data = await sitesRes.json();
    return res.status(200).json({ connected: true, ...data });
  } catch (err) {
    console.error('[Rakubun] /sites error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── DELETE /api/rakubun/disconnect ──────────────────────────────────────────
// Revokes the Rakubun API key and removes it from the user document.

router.delete('/disconnect', async (req, res) => {
  try {
    const db = global.db;
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.user._id) });

    if (user?.rakubunApiKey) {
      // Best-effort revoke on Rakubun side
      await fetch(`${RAKUBUN_BASE_URL}/api/oauth?_action=revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: RAKUADO_CLIENT_ID,
          client_secret: RAKUADO_CLIENT_SECRET,
          access_token: user.rakubunApiKey,
        }),
      }).catch((e) => console.warn('[Rakubun] Revoke request failed (non-fatal):', e.message));

      await db.collection('users').updateOne(
        { _id: new ObjectId(req.user._id) },
        { $unset: { rakubunApiKey: '', rakubunConnectedAt: '' } },
      );
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[Rakubun] /disconnect error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
