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
