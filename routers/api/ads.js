const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const crypto = require('crypto');

const TRACKING_SECRET = process.env.TRACKING_SECRET || 'change-me-in-production';
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function makeIpHash(req) {
  const raw = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || '';
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

function generateToken(campaignId, creativeId, impressionId) {
  const payload = `${campaignId}:${creativeId}:${impressionId}:${Date.now()}`;
  const sig = crypto.createHmac('sha256', TRACKING_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}|${sig}`).toString('base64url');
}

function verifyToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const lastPipe = decoded.lastIndexOf('|');
    const payload = decoded.slice(0, lastPipe);
    const sig = decoded.slice(lastPipe + 1);
    const expected = crypto.createHmac('sha256', TRACKING_SECRET).update(payload).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const parts = payload.split(':');
    // parts: campaignId, creativeId, impressionId, timestamp
    const ts = parseInt(parts[3], 10);
    if (Date.now() - ts > TOKEN_TTL_MS) return null;
    return { campaignId: parts[0], creativeId: parts[1], impressionId: parts[2] };
  } catch {
    return null;
  }
}

// GET /api/ads/serve?siteId=X&placement=banner
// Public endpoint — no auth required
router.get('/serve', async (req, res) => {
  try {
    const { siteId = '', placement = 'banner' } = req.query;
    const validPlacements = ['banner', 'in-article', 'product-card'];
    if (!validPlacements.includes(placement)) return res.json({ ad: null });

    const now = new Date();

    // 1. Find active campaigns matching placement + site
    const candidates = await global.db
      .collection('adCampaigns')
      .find({
        status: 'active',
        type: placement,
        $and: [
          { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
          { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
          { $or: [{ targetSites: { $size: 0 } }, { targetSites: siteId }] },
        ],
      })
      .toArray();

    if (!candidates.length) return res.json({ ad: null });

    // 2. Compute today's spend per candidate, filter out exhausted budgets
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const ids = candidates.map((c) => c._id.toString());

    const spendAgg = await global.db
      .collection('adBudgetTransactions')
      .aggregate([
        { $match: { campaignId: { $in: ids }, type: 'spend', createdAt: { $gte: todayStart } } },
        { $group: { _id: '$campaignId', spend: { $sum: { $abs: '$amount' } } } },
      ])
      .toArray();
    const spendMap = Object.fromEntries(spendAgg.map((r) => [r._id, r.spend]));

    // Also filter total budget exhausted
    const totalSpendAgg = await global.db
      .collection('adBudgetTransactions')
      .aggregate([
        { $match: { campaignId: { $in: ids }, type: 'spend' } },
        { $group: { _id: '$campaignId', totalSpend: { $sum: { $abs: '$amount' } } } },
      ])
      .toArray();
    const totalSpendMap = Object.fromEntries(totalSpendAgg.map((r) => [r._id, r.totalSpend]));

    const eligible = candidates.filter((c) => {
      const idStr = c._id.toString();
      const dailySpend = spendMap[idStr] || 0;
      const totalSpent = totalSpendMap[idStr] || 0;
      return dailySpend < c.dailyBudget && totalSpent < c.totalBudget;
    });

    if (!eligible.length) return res.json({ ad: null });

    // 3. Weighted random selection by bidAmount
    const totalWeight = eligible.reduce((s, c) => s + c.bidAmount, 0);
    let rand = Math.random() * totalWeight;
    let winner = eligible[0];
    for (const c of eligible) {
      rand -= c.bidAmount;
      if (rand <= 0) { winner = c; break; }
    }

    // 4. Get active creative
    const creative = await global.db
      .collection('adCreatives')
      .findOne({ campaignId: winner._id.toString(), status: 'active' });
    if (!creative) return res.json({ ad: null });

    // 5. Insert impression record (async, don't block response)
    const ipHash = makeIpHash(req);
    const impressionDoc = {
      campaignId: winner._id.toString(),
      advertiserId: winner.advertiserId,
      creativeId: creative._id.toString(),
      siteId,
      placementType: placement,
      ipHash,
      createdAt: new Date(),
    };

    const impResult = await global.db.collection('adImpressions').insertOne(impressionDoc);
    const impressionId = impResult.insertedId.toString();

    // 6. Record CPM spend (async)
    if (winner.bidType === 'CPM') {
      const spendAmount = -(winner.bidAmount / 1000);
      global.db.collection('adBudgetTransactions').insertOne({
        advertiserId: winner.advertiserId,
        campaignId: winner._id.toString(),
        impressionId,
        type: 'spend',
        amount: spendAmount,
        createdAt: new Date(),
      }).catch((err) => console.error('CPM spend insert error', err));

      // Auto-end campaign if total budget exhausted
      const newTotalSpent = (totalSpendMap[winner._id.toString()] || 0) + Math.abs(spendAmount);
      if (newTotalSpent >= winner.totalBudget) {
        global.db.collection('adCampaigns').updateOne(
          { _id: winner._id },
          { $set: { status: 'ended', updatedAt: new Date() } }
        ).catch((err) => console.error('Campaign auto-end error', err));
      }
    }

    // 7. Generate click token
    const token = generateToken(winner._id.toString(), creative._id.toString(), impressionId);
    const host = `${req.protocol}://${req.headers.host}`;

    res.json({
      ad: {
        creativeId: creative._id,
        imageUrl: creative.imageUrl,
        altText: creative.altText,
        destinationUrl: creative.destinationUrl,
        clickUrl: `${host}/api/ads/click?token=${token}`,
        impressionId,
      },
    });
  } catch (err) {
    console.error('GET /api/ads/serve', err);
    res.json({ ad: null });
  }
});

// GET /api/ads/click?token=X
router.get('/click', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send('Missing token');

  const data = verifyToken(token);
  if (!data) return res.status(400).send('Invalid or expired token');

  try {
    let impressionId;
    try { impressionId = new ObjectId(data.impressionId); } catch { return res.status(400).send('Bad impression ID'); }

    const impression = await global.db.collection('adImpressions').findOne({ _id: impressionId });
    if (!impression) return res.status(404).send('Impression not found');

    const ipHash = makeIpHash(req);

    // Dedup: skip if same ipHash already clicked this impression
    const existing = await global.db.collection('adClicks').findOne({ impressionId: data.impressionId, ipHash });
    if (!existing) {
      await global.db.collection('adClicks').insertOne({
        campaignId: data.campaignId,
        advertiserId: impression.advertiserId,
        creativeId: data.creativeId,
        impressionId: data.impressionId,
        siteId: impression.siteId,
        placementType: impression.placementType,
        ipHash,
        createdAt: new Date(),
      });

      // CPC spend
      const campaign = await global.db
        .collection('adCampaigns')
        .findOne({ _id: new ObjectId(data.campaignId) });
      if (campaign && campaign.bidType === 'CPC') {
        const spendAmount = -campaign.bidAmount;
        global.db.collection('adBudgetTransactions').insertOne({
          advertiserId: campaign.advertiserId,
          campaignId: campaign._id.toString(),
          impressionId: data.impressionId,
          type: 'spend',
          amount: spendAmount,
          createdAt: new Date(),
        }).catch((err) => console.error('CPC spend insert error', err));
      }
    }

    // Redirect to destination
    const creative = await global.db.collection('adCreatives').findOne({ _id: new ObjectId(data.creativeId) });
    if (!creative) return res.status(404).send('Creative not found');

    res.redirect(302, creative.destinationUrl);
  } catch (err) {
    console.error('GET /api/ads/click', err);
    res.status(500).send('Server error');
  }
});

module.exports = router;
