const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const ensureAuthenticated = require('../../middleware/authMiddleware');

// All routes require authentication + admin
router.use(ensureAuthenticated);
router.use((req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
});

// GET /api/admin/advertisers
router.get('/advertisers', async (req, res) => {
  try {
    const advertisers = await global.db.collection('advertisers').find({}).sort({ createdAt: -1 }).toArray();
    const ids = advertisers.map((a) => a._id.toString());

    const [campaignAgg, balanceAgg] = await Promise.all([
      global.db
        .collection('adCampaigns')
        .aggregate([
          { $match: { advertiserId: { $in: ids } } },
          { $group: { _id: '$advertiserId', count: { $sum: 1 } } },
        ])
        .toArray(),
      global.db
        .collection('adBudgetTransactions')
        .aggregate([
          { $match: { advertiserId: { $in: ids } } },
          { $group: { _id: '$advertiserId', balance: { $sum: '$amount' } } },
        ])
        .toArray(),
    ]);

    const campaignMap = Object.fromEntries(campaignAgg.map((r) => [r._id, r.count]));
    const balanceMap = Object.fromEntries(balanceAgg.map((r) => [r._id, r.balance]));

    const result = advertisers.map((a) => ({
      ...a,
      campaignCount: campaignMap[a._id.toString()] || 0,
      balance: balanceMap[a._id.toString()] || 0,
    }));

    res.json({ advertisers: result });
  } catch (err) {
    console.error('GET /api/admin/advertisers', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/campaigns?status=pending_review
router.get('/campaigns', async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    const campaigns = await global.db
      .collection('adCampaigns')
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    // Enrich with advertiser info
    const advIds = [...new Set(campaigns.map((c) => c.advertiserId))];
    const advertisers = await global.db
      .collection('advertisers')
      .find({ _id: { $in: advIds.map((id) => { try { return new ObjectId(id); } catch { return null; } }).filter(Boolean) } })
      .toArray();
    const advMap = Object.fromEntries(advertisers.map((a) => [a._id.toString(), a]));

    // Enrich with stats
    const ids = campaigns.map((c) => c._id.toString());
    const [impAgg, clkAgg] = await Promise.all([
      global.db
        .collection('adImpressions')
        .aggregate([{ $match: { campaignId: { $in: ids } } }, { $group: { _id: '$campaignId', count: { $sum: 1 } } }])
        .toArray(),
      global.db
        .collection('adClicks')
        .aggregate([{ $match: { campaignId: { $in: ids } } }, { $group: { _id: '$campaignId', count: { $sum: 1 } } }])
        .toArray(),
    ]);
    const impMap = Object.fromEntries(impAgg.map((r) => [r._id, r.count]));
    const clkMap = Object.fromEntries(clkAgg.map((r) => [r._id, r.count]));

    const result = campaigns.map((c) => ({
      ...c,
      advertiser: advMap[c.advertiserId] || null,
      impressions: impMap[c._id.toString()] || 0,
      clicks: clkMap[c._id.toString()] || 0,
    }));

    res.json({ campaigns: result });
  } catch (err) {
    console.error('GET /api/admin/campaigns', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/campaigns/:id/approve
router.put('/campaigns/:id/approve', async (req, res) => {
  try {
    let campaignId;
    try { campaignId = new ObjectId(req.params.id); } catch { return res.status(400).json({ error: 'Invalid campaign ID' }); }

    const result = await global.db
      .collection('adCampaigns')
      .updateOne(
        { _id: campaignId, status: 'pending_review' },
        { $set: { status: 'active', approvedAt: new Date(), approvedBy: req.user._id.toString() } }
      );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Campaign not found or not in pending_review status' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/admin/campaigns/:id/approve', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/advertiser-overview  — full summary for the admin advertiser dashboard
router.get('/advertiser-overview', async (req, res) => {
  try {
    // ── 1. All advertisers ────────────────────────────────────────────────────
    const advertisers = await global.db.collection('advertisers').find({}).sort({ createdAt: -1 }).toArray();
    const advIds = advertisers.map((a) => a._id.toString());

    // ── 2. All budget transactions ────────────────────────────────────────────
    const allTxns = await global.db
      .collection('adBudgetTransactions')
      .find({ advertiserId: { $in: advIds } })
      .sort({ createdAt: 1 })
      .toArray();

    // Per-advertiser balance (deposits + spends) and total deposited (deposits only)
    const balanceMap = {};
    const depositedMap = {};
    const spentMap = {};
    for (const t of allTxns) {
      const id = t.advertiserId;
      balanceMap[id] = (balanceMap[id] || 0) + (t.amount || 0);
      if ((t.amount || 0) > 0) depositedMap[id] = (depositedMap[id] || 0) + t.amount;
      if ((t.amount || 0) < 0) spentMap[id] = (spentMap[id] || 0) + Math.abs(t.amount);
    }

    // ── 3. All campaigns ──────────────────────────────────────────────────────
    const allCampaigns = await global.db
      .collection('adCampaigns')
      .find({ advertiserId: { $in: advIds } })
      .toArray();
    const campaignIds = allCampaigns.map((c) => c._id.toString());

    const campaignCountMap = {};
    const activeCampaignCountMap = {};
    for (const c of allCampaigns) {
      campaignCountMap[c.advertiserId] = (campaignCountMap[c.advertiserId] || 0) + 1;
      if (c.status === 'active') activeCampaignCountMap[c.advertiserId] = (activeCampaignCountMap[c.advertiserId] || 0) + 1;
    }

    // ── 4. Impressions & clicks per advertiser (via campaign join) ─────────────
    const [impAgg, clkAgg] = await Promise.all([
      global.db
        .collection('adImpressions')
        .aggregate([
          { $match: { campaignId: { $in: campaignIds } } },
          { $group: { _id: '$campaignId', count: { $sum: 1 } } },
        ])
        .toArray(),
      global.db
        .collection('adClicks')
        .aggregate([
          { $match: { campaignId: { $in: campaignIds } } },
          { $group: { _id: '$campaignId', count: { $sum: 1 } } },
        ])
        .toArray(),
    ]);
    const impByCampaign = Object.fromEntries(impAgg.map((r) => [r._id, r.count]));
    const clkByCampaign = Object.fromEntries(clkAgg.map((r) => [r._id, r.count]));

    // Roll impressions/clicks up to the advertiser level
    const impByAdv = {};
    const clkByAdv = {};
    for (const c of allCampaigns) {
      const cid = c._id.toString();
      const aid = c.advertiserId;
      impByAdv[aid] = (impByAdv[aid] || 0) + (impByCampaign[cid] || 0);
      clkByAdv[aid] = (clkByAdv[aid] || 0) + (clkByCampaign[cid] || 0);
    }

    // ── 5. Monthly deposit trend (last 6 months) ──────────────────────────────
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setUTCHours(0, 0, 0, 0);

    const monthlyAgg = await global.db
      .collection('adBudgetTransactions')
      .aggregate([
        { $match: { amount: { $gt: 0 }, createdAt: { $gte: sixMonthsAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
            deposited: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ])
      .toArray();

    // ── 6. Campaign status breakdown ──────────────────────────────────────────
    const statusAgg = await global.db
      .collection('adCampaigns')
      .aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ])
      .toArray();

    // ── 7. Summary ─────────────────────────────────────────────────────────────
    const totalDeposited = Object.values(depositedMap).reduce((s, v) => s + v, 0);
    const totalSpent = Object.values(spentMap).reduce((s, v) => s + v, 0);
    const totalBalance = totalDeposited - totalSpent;
    const totalImpressions = Object.values(impByAdv).reduce((s, v) => s + v, 0);
    const totalClicks = Object.values(clkByAdv).reduce((s, v) => s + v, 0);

    // ── 8. Per-advertiser rows ─────────────────────────────────────────────────
    const advertiserRows = advertisers.map((a) => {
      const id = a._id.toString();
      return {
        _id: id,
        companyName: a.companyName,
        contactName: a.contactName,
        website: a.website || '',
        status: a.status,
        createdAt: a.createdAt,
        balance: balanceMap[id] || 0,
        totalDeposited: depositedMap[id] || 0,
        totalSpent: spentMap[id] || 0,
        campaignCount: campaignCountMap[id] || 0,
        activeCampaigns: activeCampaignCountMap[id] || 0,
        impressions: impByAdv[id] || 0,
        clicks: clkByAdv[id] || 0,
      };
    });

    res.json({
      summary: {
        totalAdvertisers: advertisers.length,
        totalDeposited,
        totalSpent,
        totalBalance,
        totalCampaigns: allCampaigns.length,
        totalImpressions,
        totalClicks,
      },
      monthlyDeposits: monthlyAgg,
      campaignStatusBreakdown: statusAgg,
      advertisers: advertiserRows,
    });
  } catch (err) {
    console.error('GET /api/admin/advertiser-overview', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/campaigns/:id/reject
router.put('/campaigns/:id/reject', async (req, res) => {
  try {
    let campaignId;
    try { campaignId = new ObjectId(req.params.id); } catch { return res.status(400).json({ error: 'Invalid campaign ID' }); }

    const { reason } = req.body;
    const result = await global.db
      .collection('adCampaigns')
      .updateOne(
        { _id: campaignId },
        {
          $set: {
            status: 'rejected',
            rejectedAt: new Date(),
            rejectedBy: req.user._id.toString(),
            rejectionReason: reason ? String(reason).trim() : '',
          },
        }
      );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/admin/campaigns/:id/reject', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
