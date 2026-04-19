const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const multer = require('multer');
const crypto = require('crypto');
const stripe = require('stripe')(process.env.STRIPE_SECRET);
const ensureAuthenticated = require('../../middleware/authMiddleware');
const { uploadFileToS3 } = require('../../services/aws');

const MIN_DEPOSIT_JPY = 50000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid file type. Only JPEG, PNG, GIF, WEBP allowed.'));
  },
});

// All routes require authentication
router.use(ensureAuthenticated);

// Helper: get advertiser for authenticated user
async function getAdvertiser(userId) {
  return global.db.collection('advertisers').findOne({ userId: userId.toString() });
}

// Helper: compute balance for an advertiser
async function getBalance(advertiserId) {
  const txns = await global.db
    .collection('adBudgetTransactions')
    .find({ advertiserId: advertiserId.toString() })
    .toArray();
  return txns.reduce((sum, t) => sum + (t.amount || 0), 0);
}

// ─── Profile ─────────────────────────────────────────────────────────────────

// GET /api/advertiser/profile
router.get('/profile', async (req, res) => {
  try {
    const advertiser = await getAdvertiser(req.user._id);
    if (!advertiser) return res.json({ advertiser: null });
    const balance = await getBalance(advertiser._id);
    res.json({ advertiser: { ...advertiser, balance } });
  } catch (err) {
    console.error('GET /api/advertiser/profile', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/advertiser/register
router.post('/register', async (req, res) => {
  try {
    const existing = await getAdvertiser(req.user._id);
    if (existing) return res.status(409).json({ error: 'Advertiser profile already exists' });

    const { companyName, contactName, website } = req.body;
    if (!companyName || !contactName) {
      return res.status(400).json({ error: 'companyName and contactName are required' });
    }

    const doc = {
      userId: req.user._id.toString(),
      companyName: String(companyName).trim(),
      contactName: String(contactName).trim(),
      website: website ? String(website).trim() : '',
      status: 'active',
      createdAt: new Date(),
    };
    const result = await global.db.collection('advertisers').insertOne(doc);
    res.status(201).json({ advertiser: { ...doc, _id: result.insertedId } });
  } catch (err) {
    console.error('POST /api/advertiser/register', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Budget ───────────────────────────────────────────────────────────────────

// GET /api/advertiser/budget
router.get('/budget', async (req, res) => {
  try {
    const advertiser = await getAdvertiser(req.user._id);
    if (!advertiser) return res.status(404).json({ error: 'No advertiser profile' });

    const transactions = await global.db
      .collection('adBudgetTransactions')
      .find({ advertiserId: advertiser._id.toString() })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    const balance = transactions.reduce((sum, t) => sum + (t.amount || 0), 0);
    res.json({ balance, transactions });
  } catch (err) {
    console.error('GET /api/advertiser/budget', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/advertiser/budget/deposit  — creates Stripe checkout session
router.post('/budget/deposit', async (req, res) => {
  try {
    const advertiser = await getAdvertiser(req.user._id);
    if (!advertiser) return res.status(404).json({ error: 'No advertiser profile' });

    const amount = parseInt(req.body.amount, 10);
    if (!amount || isNaN(amount) || amount < MIN_DEPOSIT_JPY) {
      return res.status(400).json({ error: `Minimum deposit is ¥${MIN_DEPOSIT_JPY.toLocaleString()} JPY` });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'jpy',
            product_data: { name: '広告予算チャージ', description: `${amount.toLocaleString()}円 広告予算` },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.BASE_URL || 'https://' + req.headers.host}/payment/advertiser-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.BASE_URL || 'https://' + req.headers.host}/dashboard/advertiser/budget?cancelled=1`,
      metadata: {
        advertiserId: advertiser._id.toString(),
        amount: amount.toString(),
        type: 'advertiser_deposit',
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('POST /api/advertiser/budget/deposit', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Campaigns ────────────────────────────────────────────────────────────────

// GET /api/advertiser/campaigns
router.get('/campaigns', async (req, res) => {
  try {
    const advertiser = await getAdvertiser(req.user._id);
    if (!advertiser) return res.status(404).json({ error: 'No advertiser profile' });

    const filter = { advertiserId: advertiser._id.toString() };
    if (req.query.status) filter.status = req.query.status;

    const campaigns = await global.db
      .collection('adCampaigns')
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    // Attach per-campaign impression + click counts
    const ids = campaigns.map((c) => c._id.toString());
    const [impressionAgg, clickAgg] = await Promise.all([
      global.db
        .collection('adImpressions')
        .aggregate([
          { $match: { campaignId: { $in: ids } } },
          { $group: { _id: '$campaignId', count: { $sum: 1 } } },
        ])
        .toArray(),
      global.db
        .collection('adClicks')
        .aggregate([
          { $match: { campaignId: { $in: ids } } },
          { $group: { _id: '$campaignId', count: { $sum: 1 } } },
        ])
        .toArray(),
    ]);

    const impMap = Object.fromEntries(impressionAgg.map((r) => [r._id, r.count]));
    const clkMap = Object.fromEntries(clickAgg.map((r) => [r._id, r.count]));

    // Today's spend per campaign
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const spendAgg = await global.db
      .collection('adBudgetTransactions')
      .aggregate([
        {
          $match: {
            campaignId: { $in: ids },
            type: 'spend',
            createdAt: { $gte: todayStart },
          },
        },
        { $group: { _id: '$campaignId', spend: { $sum: { $abs: '$amount' } } } },
      ])
      .toArray();
    const spendMap = Object.fromEntries(spendAgg.map((r) => [r._id, r.spend]));

    const enriched = campaigns.map((c) => ({
      ...c,
      impressions: impMap[c._id.toString()] || 0,
      clicks: clkMap[c._id.toString()] || 0,
      todaySpend: spendMap[c._id.toString()] || 0,
    }));

    res.json({ campaigns: enriched });
  } catch (err) {
    console.error('GET /api/advertiser/campaigns', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/advertiser/campaigns
router.post('/campaigns', async (req, res) => {
  try {
    const advertiser = await getAdvertiser(req.user._id);
    if (!advertiser) return res.status(404).json({ error: 'No advertiser profile' });

    const { name, type, bidType, bidAmount, dailyBudget, totalBudget, startDate, endDate, targetSites } = req.body;
    if (!name || !type || !bidType || !bidAmount || !dailyBudget || !totalBudget) {
      return res.status(400).json({ error: 'Missing required campaign fields' });
    }
    const validTypes = ['banner', 'in-article', 'product-card'];
    if (!validTypes.includes(type)) return res.status(400).json({ error: 'Invalid placement type' });
    if (!['CPM', 'CPC'].includes(bidType)) return res.status(400).json({ error: 'Invalid bid type' });

    const doc = {
      advertiserId: advertiser._id.toString(),
      name: String(name).trim(),
      type,
      bidType,
      bidAmount: parseInt(bidAmount, 10),
      dailyBudget: parseInt(dailyBudget, 10),
      totalBudget: parseInt(totalBudget, 10),
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      targetSites: Array.isArray(targetSites) ? targetSites : [],
      status: 'draft',
      createdAt: new Date(),
    };

    const result = await global.db.collection('adCampaigns').insertOne(doc);
    res.status(201).json({ campaign: { ...doc, _id: result.insertedId } });
  } catch (err) {
    console.error('POST /api/advertiser/campaigns', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/advertiser/campaigns/:id
router.get('/campaigns/:id', async (req, res) => {
  try {
    const advertiser = await getAdvertiser(req.user._id);
    if (!advertiser) return res.status(404).json({ error: 'No advertiser profile' });

    let campaignId;
    try { campaignId = new ObjectId(req.params.id); } catch { return res.status(400).json({ error: 'Invalid campaign ID' }); }

    const campaign = await global.db
      .collection('adCampaigns')
      .findOne({ _id: campaignId, advertiserId: advertiser._id.toString() });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    // Daily time series (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setUTCHours(0, 0, 0, 0);

    const idStr = campaign._id.toString();
    const [impressionSeries, clickSeries, creatives] = await Promise.all([
      global.db
        .collection('adImpressions')
        .aggregate([
          { $match: { campaignId: idStr, createdAt: { $gte: thirtyDaysAgo } } },
          { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ])
        .toArray(),
      global.db
        .collection('adClicks')
        .aggregate([
          { $match: { campaignId: idStr, createdAt: { $gte: thirtyDaysAgo } } },
          { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ])
        .toArray(),
      global.db.collection('adCreatives').find({ campaignId: idStr, status: { $ne: 'archived' } }).toArray(),
    ]);

    const totalSpend = await global.db
      .collection('adBudgetTransactions')
      .aggregate([
        { $match: { campaignId: idStr, type: 'spend' } },
        { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } },
      ])
      .toArray();

    res.json({
      campaign,
      creatives,
      impressionSeries,
      clickSeries,
      totalSpend: totalSpend[0]?.total || 0,
    });
  } catch (err) {
    console.error('GET /api/advertiser/campaigns/:id', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/advertiser/campaigns/:id
router.put('/campaigns/:id', async (req, res) => {
  try {
    const advertiser = await getAdvertiser(req.user._id);
    if (!advertiser) return res.status(404).json({ error: 'No advertiser profile' });

    let campaignId;
    try { campaignId = new ObjectId(req.params.id); } catch { return res.status(400).json({ error: 'Invalid campaign ID' }); }

    const campaign = await global.db
      .collection('adCampaigns')
      .findOne({ _id: campaignId, advertiserId: advertiser._id.toString() });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (!['draft', 'paused'].includes(campaign.status)) {
      return res.status(400).json({ error: 'Only draft or paused campaigns can be edited' });
    }

    const { name, bidAmount, dailyBudget, totalBudget, startDate, endDate, targetSites } = req.body;
    const update = {};
    if (name) update.name = String(name).trim();
    if (bidAmount) update.bidAmount = parseInt(bidAmount, 10);
    if (dailyBudget) update.dailyBudget = parseInt(dailyBudget, 10);
    if (totalBudget) update.totalBudget = parseInt(totalBudget, 10);
    if (startDate) update.startDate = new Date(startDate);
    if (endDate) update.endDate = new Date(endDate);
    if (targetSites) update.targetSites = Array.isArray(targetSites) ? targetSites : [];
    update.updatedAt = new Date();

    await global.db.collection('adCampaigns').updateOne({ _id: campaignId }, { $set: update });
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/advertiser/campaigns/:id', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/advertiser/campaigns/:id  (soft delete)
router.delete('/campaigns/:id', async (req, res) => {
  try {
    const advertiser = await getAdvertiser(req.user._id);
    if (!advertiser) return res.status(404).json({ error: 'No advertiser profile' });

    let campaignId;
    try { campaignId = new ObjectId(req.params.id); } catch { return res.status(400).json({ error: 'Invalid campaign ID' }); }

    await global.db
      .collection('adCampaigns')
      .updateOne(
        { _id: campaignId, advertiserId: advertiser._id.toString() },
        { $set: { status: 'ended', updatedAt: new Date() } }
      );
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/advertiser/campaigns/:id', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/advertiser/campaigns/:id/submit
router.post('/campaigns/:id/submit', async (req, res) => {
  try {
    const advertiser = await getAdvertiser(req.user._id);
    if (!advertiser) return res.status(404).json({ error: 'No advertiser profile' });

    let campaignId;
    try { campaignId = new ObjectId(req.params.id); } catch { return res.status(400).json({ error: 'Invalid campaign ID' }); }

    const campaign = await global.db
      .collection('adCampaigns')
      .findOne({ _id: campaignId, advertiserId: advertiser._id.toString() });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (campaign.status !== 'draft') return res.status(400).json({ error: 'Only draft campaigns can be submitted' });

    // Must have at least one active creative
    const creative = await global.db
      .collection('adCreatives')
      .findOne({ campaignId: campaign._id.toString(), status: 'active' });
    if (!creative) return res.status(400).json({ error: 'Add at least one creative before submitting' });

    await global.db
      .collection('adCampaigns')
      .updateOne({ _id: campaignId }, { $set: { status: 'pending_review', submittedAt: new Date() } });
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/advertiser/campaigns/:id/submit', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/advertiser/campaigns/:id/pause
router.post('/campaigns/:id/pause', async (req, res) => {
  try {
    const advertiser = await getAdvertiser(req.user._id);
    if (!advertiser) return res.status(404).json({ error: 'No advertiser profile' });

    let campaignId;
    try { campaignId = new ObjectId(req.params.id); } catch { return res.status(400).json({ error: 'Invalid campaign ID' }); }

    const campaign = await global.db
      .collection('adCampaigns')
      .findOne({ _id: campaignId, advertiserId: advertiser._id.toString() });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const newStatus = campaign.status === 'active' ? 'paused' : (campaign.status === 'paused' ? 'active' : null);
    if (!newStatus) return res.status(400).json({ error: 'Campaign cannot be toggled in its current status' });

    await global.db
      .collection('adCampaigns')
      .updateOne({ _id: campaignId }, { $set: { status: newStatus, updatedAt: new Date() } });
    res.json({ ok: true, status: newStatus });
  } catch (err) {
    console.error('POST /api/advertiser/campaigns/:id/pause', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Creatives ────────────────────────────────────────────────────────────────

// POST /api/advertiser/creatives  (multipart/form-data)
router.post('/creatives', upload.single('image'), async (req, res) => {
  try {
    const advertiser = await getAdvertiser(req.user._id);
    if (!advertiser) return res.status(404).json({ error: 'No advertiser profile' });
    if (!req.file) return res.status(400).json({ error: 'Image file is required' });

    const { campaignId, altText, destinationUrl } = req.body;
    if (!campaignId || !destinationUrl) {
      return res.status(400).json({ error: 'campaignId and destinationUrl are required' });
    }

    // Validate campaign ownership
    let cid;
    try { cid = new ObjectId(campaignId); } catch { return res.status(400).json({ error: 'Invalid campaign ID' }); }
    const campaign = await global.db
      .collection('adCampaigns')
      .findOne({ _id: cid, advertiserId: advertiser._id.toString() });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    // Determine image dimensions from headers (we don't parse — store file ref)
    const ext = req.file.mimetype.split('/')[1].replace('jpeg', 'jpg');
    const fileName = `ad-creatives/${advertiser._id}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    const s3Result = await uploadFileToS3(req.file.buffer, fileName);

    // Validate destination URL
    let parsedUrl;
    try { parsedUrl = new URL(destinationUrl); } catch { return res.status(400).json({ error: 'Invalid destination URL' }); }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: 'Destination URL must use http or https' });
    }

    const doc = {
      campaignId: campaign._id.toString(),
      advertiserId: advertiser._id.toString(),
      imageUrl: s3Result.url,
      altText: altText ? String(altText).trim() : '',
      destinationUrl: parsedUrl.toString(),
      status: 'active',
      createdAt: new Date(),
    };

    const result = await global.db.collection('adCreatives').insertOne(doc);
    res.status(201).json({ creative: { ...doc, _id: result.insertedId } });
  } catch (err) {
    console.error('POST /api/advertiser/creatives', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/advertiser/creatives
router.get('/creatives', async (req, res) => {
  try {
    const advertiser = await getAdvertiser(req.user._id);
    if (!advertiser) return res.status(404).json({ error: 'No advertiser profile' });

    const filter = { advertiserId: advertiser._id.toString(), status: { $ne: 'archived' } };
    if (req.query.campaignId) filter.campaignId = req.query.campaignId;

    const creatives = await global.db.collection('adCreatives').find(filter).sort({ createdAt: -1 }).toArray();
    res.json({ creatives });
  } catch (err) {
    console.error('GET /api/advertiser/creatives', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/advertiser/creatives/:id  (soft delete)
router.delete('/creatives/:id', async (req, res) => {
  try {
    const advertiser = await getAdvertiser(req.user._id);
    if (!advertiser) return res.status(404).json({ error: 'No advertiser profile' });

    let creativeId;
    try { creativeId = new ObjectId(req.params.id); } catch { return res.status(400).json({ error: 'Invalid creative ID' }); }

    await global.db
      .collection('adCreatives')
      .updateOne(
        { _id: creativeId, advertiserId: advertiser._id.toString() },
        { $set: { status: 'archived', updatedAt: new Date() } }
      );
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/advertiser/creatives/:id', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Stats ────────────────────────────────────────────────────────────────────

// GET /api/advertiser/stats
router.get('/stats', async (req, res) => {
  try {
    const advertiser = await getAdvertiser(req.user._id);
    if (!advertiser) return res.status(404).json({ error: 'No advertiser profile' });

    const advIdStr = advertiser._id.toString();
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const [totalImpressions, totalClicks, todayImpressions, todayClicks, balanceTxns, todaySpend] =
      await Promise.all([
        global.db.collection('adImpressions').countDocuments({ advertiserId: advIdStr }),
        global.db.collection('adClicks').countDocuments({ advertiserId: advIdStr }),
        global.db.collection('adImpressions').countDocuments({ advertiserId: advIdStr, createdAt: { $gte: todayStart } }),
        global.db.collection('adClicks').countDocuments({ advertiserId: advIdStr, createdAt: { $gte: todayStart } }),
        global.db.collection('adBudgetTransactions').find({ advertiserId: advIdStr }).toArray(),
        global.db
          .collection('adBudgetTransactions')
          .aggregate([
            { $match: { advertiserId: advIdStr, type: 'spend', createdAt: { $gte: todayStart } } },
            { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } },
          ])
          .toArray(),
      ]);

    const balance = balanceTxns.reduce((s, t) => s + (t.amount || 0), 0);
    const totalSpend = balanceTxns.filter((t) => t.type === 'spend').reduce((s, t) => s + Math.abs(t.amount || 0), 0);

    res.json({
      balance,
      totalSpend,
      totalImpressions,
      totalClicks,
      ctr: totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : '0.00',
      todayImpressions,
      todayClicks,
      todaySpend: todaySpend[0]?.total || 0,
    });
  } catch (err) {
    console.error('GET /api/advertiser/stats', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/advertiser/stats/campaigns
router.get('/stats/campaigns', async (req, res) => {
  try {
    const advertiser = await getAdvertiser(req.user._id);
    if (!advertiser) return res.status(404).json({ error: 'No advertiser profile' });

    const advIdStr = advertiser._id.toString();
    const campaigns = await global.db.collection('adCampaigns').find({ advertiserId: advIdStr }).toArray();
    const ids = campaigns.map((c) => c._id.toString());

    const [impAgg, clkAgg, spendAgg] = await Promise.all([
      global.db
        .collection('adImpressions')
        .aggregate([{ $match: { campaignId: { $in: ids } } }, { $group: { _id: '$campaignId', count: { $sum: 1 } } }])
        .toArray(),
      global.db
        .collection('adClicks')
        .aggregate([{ $match: { campaignId: { $in: ids } } }, { $group: { _id: '$campaignId', count: { $sum: 1 } } }])
        .toArray(),
      global.db
        .collection('adBudgetTransactions')
        .aggregate([
          { $match: { campaignId: { $in: ids }, type: 'spend' } },
          { $group: { _id: '$campaignId', spend: { $sum: { $abs: '$amount' } } } },
        ])
        .toArray(),
    ]);

    const impMap = Object.fromEntries(impAgg.map((r) => [r._id, r.count]));
    const clkMap = Object.fromEntries(clkAgg.map((r) => [r._id, r.count]));
    const spendMap = Object.fromEntries(spendAgg.map((r) => [r._id, r.spend]));

    const result = campaigns.map((c) => {
      const imp = impMap[c._id.toString()] || 0;
      const clk = clkMap[c._id.toString()] || 0;
      return {
        ...c,
        impressions: imp,
        clicks: clk,
        ctr: imp > 0 ? ((clk / imp) * 100).toFixed(2) : '0.00',
        spend: spendMap[c._id.toString()] || 0,
        remainingBudget: c.totalBudget - (spendMap[c._id.toString()] || 0),
      };
    });

    res.json({ campaigns: result });
  } catch (err) {
    console.error('GET /api/advertiser/stats/campaigns', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
