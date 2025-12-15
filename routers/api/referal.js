const express = require('express');
const router = express.Router();
const db = global.db;
const POPUPS = db.collection('referalPopups');
const multer = require('multer');
const aws = require('aws-sdk');
const path = require('path');
const mime = require('mime-types');
const { createHash } = require('crypto');
const { ObjectId } = require('mongodb');

// AWS S3 Configuration
const s3 = new aws.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

const uploadToS3 = async (buffer, hash, filename) => {
  const contentType = mime.lookup(path.extname(filename)) || 'application/octet-stream';
  const key = `${hash}_${filename}`;
  await s3.upload({ Bucket: process.env.AWS_S3_BUCKET_NAME, Key: key, Body: buffer, ContentType: contentType }).promise();
  return `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
};

const handleFileUpload = async (file, db) => {
  const buffer = file.buffer;
  const hash = createHash('md5').update(buffer).digest('hex');
  const awsimages = db.collection('awsimages');
  const existing = await awsimages.findOne({ hash });
  if (existing) return `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${existing.key}`;
  const url = await uploadToS3(buffer, hash, file.originalname);
  const key = url.split('/').pop();
  await awsimages.insertOne({ key, hash });
  return url;
};

// Multer setup
const storage = multer.memoryStorage();
const fileFilter = (req, f, cb) => {
  const ok = /jpeg|jpg|png|gif/.test(f.mimetype) && /jpeg|jpg|png|gif/.test(path.extname(f.originalname).toLowerCase());
  cb(ok ? null : new Error('Only images allowed'), ok);
};
const upload = multer({ storage, fileFilter, limits: { fileSize: 5*1024*1024 } });

// Helper to get current timestamp
const now = () => Date.now();

// Helper to filter refery array to last 24 hours
const filterRecentRefery = (refery) => {
  const cutoff = now() - 24 * 60 * 60 * 1000;
  return (refery || []).filter(r => r.timestamp && r.timestamp >= cutoff);
};

// Helper to store daily analytics data immediately
const storeDailyAnalytics = async (domain, popupId, viewIncrement = 0, clickIncrement = 0) => {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  const ANALYTICS_DAILY = global.db.collection('analyticsDaily');
  
  // Get existing daily record or create new one
  let dailyRecord = await ANALYTICS_DAILY.findOne({ date: todayStr });
  
  if (!dailyRecord) {
    dailyRecord = {
      date: todayStr,
      timestamp: today.getTime(),
      total: { views: 0, clicks: 0 },
      sites: {}
    };
  }
  
  // Update totals
  dailyRecord.total.views += viewIncrement;
  dailyRecord.total.clicks += clickIncrement;
  
  // Update site-specific data
  if (!dailyRecord.sites[domain]) {
    dailyRecord.sites[domain] = { views: 0, clicks: 0 };
  }
  dailyRecord.sites[domain].views += viewIncrement;
  dailyRecord.sites[domain].clicks += clickIncrement;
  
  // Store the updated record
  await ANALYTICS_DAILY.replaceOne(
    { date: todayStr },
    dailyRecord,
    { upsert: true }
  );
};

// Helper for ObjectId validation
function isValidObjectId(id) {
  return typeof id === 'string' && /^[a-fA-F0-9]{24}$/.test(id);
}

// Helper to normalize slugs consistently across create/update flows
const normalizeSlug = (slugRaw = '') => {
  if (typeof slugRaw !== 'string') return '';
  return slugRaw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
};

// Function to reset view and click data for all popups
async function resetViewClickData() {
  await POPUPS.updateMany(
    {},
    {
      $set: {
        views: 0,
        clicks: 0,
        refery: []
      }
    }
  );
}
  
// POST endpoint to reset all view/click data
router.post('/reset', async (req, res) => {
  await resetViewClickData();
  return res.sendStatus(200);
});

// GET referral info (by _id)
router.get('/info', async (req, res) => {
  let id = req.query.popup;
  if (!isValidObjectId(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const doc = await POPUPS.findOne({ _id: new ObjectId(id) });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    const recentRefery = filterRecentRefery(doc.refery);
    const views24h = recentRefery.reduce((sum, entry) => sum + (entry.view || 0), 0);
    const clicks24h = recentRefery.reduce((sum, entry) => sum + (entry.click || 0), 0);
    return res.json({
      _id: doc._id,
      imageUrl: doc.imageUrl,
      targetUrl: doc.targetUrl,
      slug: doc.slug || '',
      refery: doc.refery || [],
      enabled: doc.enabled !== false,
      order: doc.order,
      views: doc.views || 0,
      clicks: doc.clicks || 0,
      views24h,
      clicks24h
    });
  } catch (e) {
    return res.status(400).json({ error: 'Invalid id' });
  }
});

// GET all enabled popups (for frontend) - Only Yahoo popups
router.get('/enabled', async (req, res) => {
  const popups = await POPUPS.find({ 
    enabled: { $ne: false },
    slug: { $regex: /yahoo/, $options: 'i' }
  }).sort({ order: 1 }).toArray();
  res.json(popups.map(p => ({
    _id: p._id,
    imageUrl: p.imageUrl,
    targetUrl: p.targetUrl,
    order: p.order,
    slug: p.slug || ''
  })));
});

// GET register a view (by _id)
router.get('/register-view', async (req, res) => {
  let id = req.query.popup;
  const domain = req.query.domain || 'unknown';
  if (!isValidObjectId(id)) return res.sendStatus(400);
  const popup = await POPUPS.findOne({ _id: new ObjectId(id) });
  if (!popup) return res.sendStatus(404);
  
  // Update popup stats
  await POPUPS.updateOne({ _id: popup._id }, { $inc: { views: 1 } });
  
  // NOTE: analytics are now computed from cumulative snapshots by the analytics cron job.
  // We retain popup-level counters (`views`) and `refery` for snapshot aggregation,
  // but we no longer write directly to `analyticsDaily` here to avoid double-counting.
  
  // Update refery data (keep for backward compatibility)
  let refery = filterRecentRefery(popup.refery);
  let found = false;
  refery = refery.map(r => {
    if (r.domain === domain) {
      found = true;
      return { ...r, view: (r.view || 0) + 1, timestamp: now() };
    }
    return r;
  });
  if (!found) refery.push({ domain, view: 1, click: 0, timestamp: now() });
  await POPUPS.updateOne({ _id: popup._id }, { $set: { refery } });
  
  return res.sendStatus(200);
});

// GET register a click (by _id)
router.get('/register-click', async (req, res) => {
  let id = req.query.popup;
  const domain = req.query.domain || 'unknown';
  if (!isValidObjectId(id)) return res.sendStatus(400);
  const popup = await POPUPS.findOne({ _id: new ObjectId(id) });
  if (!popup) return res.sendStatus(404);
  
  // Update popup stats
  await POPUPS.updateOne({ _id: popup._id }, { $inc: { clicks: 1 } });
  
  // NOTE: analytics are now computed from cumulative snapshots by the analytics cron job.
  // We retain popup-level counters (`clicks`) and `refery` for snapshot aggregation,
  // but we no longer write directly to `analyticsDaily` here to avoid double-counting.
  
  // Update refery data (keep for backward compatibility)
  let refery = filterRecentRefery(popup.refery);
  let found = false;
  refery = refery.map(r => {
    if (r.domain === domain) {
      found = true;
      return { ...r, click: (r.click || 0) + 1, timestamp: now() };
    }
    return r;
  });
  if (!found) refery.push({ domain, view: 0, click: 1, timestamp: now() });
  await POPUPS.updateOne({ _id: popup._id }, { $set: { refery } });
  
  return res.sendStatus(200);
});

// POST update popup order (by _id)
router.post('/order', async (req, res) => {
  let orders = req.body.order || [];
  let popups = req.body.popup || [];
  if (!Array.isArray(orders)) orders = [orders];
  if (!Array.isArray(popups)) popups = [popups];
  for (let i = 0; i < popups.length; i++) {
    const id = popups[i];
    if (!isValidObjectId(id)) continue;
    const o = parseInt(orders[i], 10);
    await POPUPS.updateOne({ _id: new ObjectId(id) }, { $set: { order: o } });
  }
  // Re-normalize
  const userPopups = await POPUPS.find({}).sort({ order: 1 }).toArray();
  for (let i = 0; i < userPopups.length; i++) {
    await POPUPS.updateOne({ _id: userPopups[i]._id }, { $set: { order: i + 1 } });
  }
  return res.sendStatus(200);
});

// POST save (add or update by _id)
router.post('/save', upload.single('image'), async (req, res) => {
  let { popup, targetUrl, enabled, slug } = req.body;
  let imageUrl = req.body.imageUrl;
  const normalizedSlug = normalizeSlug(slug);
  console.log('[referal::save] Incoming save request', { popup, targetUrl, slug: normalizedSlug });

  if (popup && !isValidObjectId(popup)) return res.status(400).json({ error: 'Invalid id' });
  if (req.file) imageUrl = await handleFileUpload(req.file, global.db);
  enabled = enabled === 'false' ? false : true;

  if (!normalizedSlug) {
    return res.status(400).json({ error: 'Slug is required' });
  }

  const slugQuery = { slug: normalizedSlug };
  if (popup) {
    slugQuery._id = { $ne: new ObjectId(popup) };
  }
  const existingSlugOwner = await POPUPS.findOne(slugQuery);
  if (existingSlugOwner) {
    console.warn('[referal::save] Duplicate slug detected', normalizedSlug);
    return res.status(409).json({ error: 'Slug already exists. Please choose a different value.' });
  }

  if (!popup) {
    // create
    const count = await POPUPS.countDocuments({});
    const nextOrder = count + 1;
    const result = await POPUPS.insertOne({
      imageUrl,
      targetUrl,
      slug: normalizedSlug,
      order: nextOrder,
      views: 0,
      clicks: 0,
      refery: [],
      enabled
    });
    console.log('[referal::save] Created popup', { id: result.insertedId, slug: normalizedSlug });
    return res.json({ imageUrl, _id: result.insertedId, slug: normalizedSlug });
  } else {
    // update
    await POPUPS.updateOne(
      { _id: new ObjectId(popup) },
      { $set: { imageUrl, targetUrl, enabled, slug: normalizedSlug } }
    );
    console.log('[referal::save] Updated popup', { id: popup, slug: normalizedSlug });
    return res.json({ imageUrl, slug: normalizedSlug });
  }
});

// POST enable/disable popup
router.post('/toggle', async (req, res) => {
  const { id, enabled } = req.body;
  if (!isValidObjectId(id)) return res.status(400).json({ error: 'Invalid id' });
  await POPUPS.updateOne({ _id: new ObjectId(id) }, { $set: { enabled: enabled === 'true' } });
  return res.sendStatus(200);
});

// DELETE popup (by _id)
router.delete('/:popup', async (req, res) => {
  const id = req.params.popup;
  if (!isValidObjectId(id)) return res.status(400).json({ error: 'Invalid id' });
  const result = await POPUPS.deleteOne({ _id: new ObjectId(id) });
  if (result.deletedCount === 0) {
    return res.status(404).json({ error: 'Not found' });
  }
  // Re-normalize order
  const userPopups = await POPUPS.find({}).sort({ order: 1 }).toArray();
  for (let i = 0; i < userPopups.length; i++) {
    await POPUPS.updateOne({ _id: userPopups[i]._id }, { $set: { order: i + 1 } });
  }
  return res.sendStatus(200);
});

// GET API metadata
router.get('/about', (req, res) => {
  res.json({ app: 'referal', version: '1.0.0', description: 'Referral popups API' });
});

// GET next popup in alternating rotation - simplified global alternation
router.get('/next-popup', async (req, res) => {
  try {
    // Get all enabled popups sorted by order
    const enabledPopups = await POPUPS.find({ enabled: { $ne: false } }).sort({ order: 1 }).toArray();
    
    if (enabledPopups.length === 0) {
      return res.json({ popup: null });
    }

    // Get total views across all popups to determine which popup to show next
    const totalViews = enabledPopups.reduce((sum, popup) => sum + (popup.views || 0), 0);
    
    // Use modulo to cycle through popups
    const selectedIndex = totalViews % enabledPopups.length;
    const selectedPopup = enabledPopups[selectedIndex];

    // Return the selected popup
    res.json({
      popup: {
        _id: selectedPopup._id,
        imageUrl: selectedPopup.imageUrl,
        targetUrl: selectedPopup.targetUrl,
        order: selectedPopup.order
      }
    });
  } catch (error) {
    console.error('Error getting next popup:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;