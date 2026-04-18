const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const ensureAuthenticated = require('../../middleware/authMiddleware');
const ensureMembership = require('../../middleware/ensureMembership');

// 1×1 transparent GIF
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

function cleanDomain(url) {
  if (!url) return '';
  let d = url.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '');
  d = d.replace(/^www\./, '');
  d = d.replace(/\/$/, '');
  return d.split('/')[0];
}

function todayStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ─── GET /api/partner-metrics/hit ─────────────────────────────────────────────
// Beacon endpoint — no auth, CORS-open, returns 1×1 transparent GIF
router.get('/hit', async (req, res) => {
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store,no-cache,must-revalidate');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  try {
    const pid = String(req.query.pid || '').replace(/[^a-zA-Z0-9]/g, '');
    if (!pid || pid.length < 20) return res.end(TRANSPARENT_GIF);

    let request;
    try {
      request = await global.db.collection('partnerRequests').findOne(
        { _id: new ObjectId(pid) },
        { projection: { blogUrl: 1, metricsSnippetSent: 1 } }
      );
    } catch {
      return res.end(TRANSPARENT_GIF);
    }

    if (!request || !request.metricsSnippetSent) return res.end(TRANSPARENT_GIF);

    const domain = cleanDomain(request.blogUrl);
    const date = todayStr();
    const col = global.db.collection('partnerMetricsDaily');

    const safePath = String(req.query.p || '/').slice(0, 300);
    const safeRef = String(req.query.r || '').slice(0, 300);
    const safeSid = String(req.query.s || '').replace(/[^a-z0-9]/gi, '').slice(0, 40);
    const isMobile = req.query.m === '1';

    // Check if this session is new for today
    const existing = await col.findOne(
      { domain, date },
      { projection: { sessions: 1 } }
    );
    const isNewSession = !existing || !(existing.sessions || []).includes(safeSid);

    const update = {
      $inc: {
        pageviews: 1,
        [isMobile ? 'devices.mobile' : 'devices.desktop']: 1,
        ...(isNewSession ? { uniqueSessions: 1 } : {}),
      },
      $set: { updatedAt: new Date() },
    };

    if (isNewSession && safeSid) {
      // Keep at most 2 000 session IDs per day to cap document size
      update.$push = { sessions: { $each: [safeSid], $slice: -2000 } };
    }

    await col.updateOne({ domain, date }, update, { upsert: true });

    // Update per-path counts
    if (safePath) {
      const pathRes = await col.updateOne(
        { domain, date, 'paths.path': safePath },
        { $inc: { 'paths.$.count': 1 } }
      );
      if (pathRes.matchedCount === 0) {
        await col.updateOne(
          { domain, date },
          { $push: { paths: { path: safePath, count: 1 } } }
        );
      }
    }

    // Update per-referrer counts (skip self-referrals)
    if (safeRef && !safeRef.includes(domain)) {
      let cleanRef;
      try {
        cleanRef = new URL(safeRef).hostname;
      } catch {
        cleanRef = safeRef.slice(0, 100);
      }

      if (cleanRef) {
        const refRes = await col.updateOne(
          { domain, date, 'referrers.referrer': cleanRef },
          { $inc: { 'referrers.$.count': 1 } }
        );
        if (refRes.matchedCount === 0) {
          await col.updateOne(
            { domain, date },
            { $push: { referrers: { referrer: cleanRef, count: 1 } } }
          );
        }
      }
    }
  } catch (err) {
    console.error('[partner-metrics/hit]', err.message);
  }

  res.end(TRANSPARENT_GIF);
});

// ─── GET /api/partner-metrics/data ────────────────────────────────────────────
// Returns metrics for the authenticated partner's own site
router.get('/data', ensureAuthenticated, async (req, res) => {
  try {
    const { requestId, days = '30' } = req.query;
    const userId = req.user._id.toString();
    const userEmail = req.user.email;

    const col = global.db.collection('partnerRequests');
    let request;

    if (requestId) {
      try {
        request = await col.findOne({
          _id: new ObjectId(requestId),
          $or: [{ userId }, { email: userEmail }],
        });
      } catch {
        return res.status(400).json({ success: false, error: 'Invalid request ID' });
      }
    } else {
      request = await col.findOne({ $or: [{ userId }, { email: userEmail }] });
    }

    if (!request) return res.status(404).json({ success: false, error: 'Application not found' });

    if (!request.metricsSnippetSent) {
      return res.json({ success: true, available: false, domain: null, daily: [] });
    }

    const domain = cleanDomain(request.blogUrl);
    const numDays = Math.min(parseInt(days) || 30, 90);
    const today = todayStr();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - numDays);
    const start = startDate.toISOString().slice(0, 10);

    const records = await global.db
      .collection('partnerMetricsDaily')
      .find({ domain, date: { $gte: start, $lte: today } })
      .sort({ date: 1 })
      .toArray();

    let totalPageviews = 0;
    let totalSessions = 0;
    const pathsMap = {};
    const referrersMap = {};
    const totalDevices = { mobile: 0, desktop: 0 };

    const daily = records.map((r) => {
      totalPageviews += r.pageviews || 0;
      totalSessions += r.uniqueSessions || 0;
      (r.paths || []).forEach(({ path, count }) => {
        pathsMap[path] = (pathsMap[path] || 0) + count;
      });
      (r.referrers || []).forEach(({ referrer, count }) => {
        referrersMap[referrer] = (referrersMap[referrer] || 0) + count;
      });
      totalDevices.mobile += r.devices?.mobile || 0;
      totalDevices.desktop += r.devices?.desktop || 0;
      return {
        date: r.date,
        pageviews: r.pageviews || 0,
        sessions: r.uniqueSessions || 0,
      };
    });

    const topPaths = Object.entries(pathsMap)
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topReferrers = Object.entries(referrersMap)
      .map(([referrer, count]) => ({ referrer, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    res.json({
      success: true,
      available: true,
      domain,
      totalPageviews,
      totalSessions,
      topPaths,
      topReferrers,
      devices: totalDevices,
      daily,
    });
  } catch (err) {
    console.error('[partner-metrics/data]', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ─── GET /api/partner-metrics/admin-summary ────────────────────────────────────
// Admin overview: per-domain aggregated metrics
router.get('/admin-summary', ensureAuthenticated, ensureMembership, async (req, res) => {
  try {
    const { domain, days = '30' } = req.query;
    const numDays = Math.min(parseInt(days) || 30, 90);
    const today = todayStr();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - numDays);
    const start = startDate.toISOString().slice(0, 10);

    const query = { date: { $gte: start, $lte: today } };
    if (domain) query.domain = domain;

    const records = await global.db
      .collection('partnerMetricsDaily')
      .find(query)
      .sort({ domain: 1, date: 1 })
      .toArray();

    const byDomain = {};
    for (const r of records) {
      if (!byDomain[r.domain]) byDomain[r.domain] = { pageviews: 0, sessions: 0, days: 0 };
      byDomain[r.domain].pageviews += r.pageviews || 0;
      byDomain[r.domain].sessions += r.uniqueSessions || 0;
      byDomain[r.domain].days += 1;
    }

    const summary = Object.entries(byDomain).map(([d, v]) => ({
      domain: d,
      pageviews: v.pageviews,
      sessions: v.sessions,
      days: v.days,
      avgDailyPageviews: v.days > 0 ? Math.round(v.pageviews / v.days) : 0,
    }));

    res.json({ success: true, summary });
  } catch (err) {
    console.error('[partner-metrics/admin-summary]', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ─── Serve the tracking JS ─────────────────────────────────────────────────────
// Called via app.get('/api/partner-metrics.js', serveMetricsScript)
function serveMetricsScript(req, res) {
  const pid = String(req.query.pid || '').replace(/[^a-zA-Z0-9]/g, '');
  const base = process.env.PRODUCT_URL || `${req.protocol}://${req.get('host')}`;

  if (!pid) {
    res.setHeader('Content-Type', 'application/javascript');
    return res.status(400).end('// pid parameter is required');
  }

  // Lightweight pixel-tracker: session-aware, anonymous, no PII
  const script = [
    '(function(){',
    `var pid="${pid}",base="${base}";`,
    'var sid=sessionStorage.getItem("_rk_m");',
    'if(!sid){sid=(Math.random().toString(36).substr(2,9)+Date.now().toString(36));',
    'sessionStorage.setItem("_rk_m",sid);}',
    'var m=/Mobile|Android|iPhone|iPad/i.test(navigator.userAgent)?1:0;',
    'var i=new Image();',
    'i.src=base+"/api/partner-metrics/hit"',
    '+"?pid="+encodeURIComponent(pid)',
    '+"&p="+encodeURIComponent(location.pathname)',
    '+"&r="+encodeURIComponent(document.referrer)',
    '+"&s="+encodeURIComponent(sid)',
    '+"&m="+m;',
    '})();',
  ].join('');

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(script);
}

module.exports = { router, serveMetricsScript };
