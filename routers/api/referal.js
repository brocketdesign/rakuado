const express = require('express');
const router = express.Router();
const db = global.db;
const POPUPS = db.collection('referalPopups');
const EVENTS = db.collection('referalEvents');
const multer = require('multer');
const aws = require('aws-sdk');
const path = require('path');
const mime = require('mime-types');
const { createHash } = require('crypto');

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

// GET referral info
router.get('/info', async (req, res) => {
  const popup = parseInt(req.query.popup, 10);
  const doc = await POPUPS.findOne({ popup });
  if (!doc) return res.status(404).json({ error: 'Not found' });
  return res.json({ imageUrl: doc.imageUrl, targetUrl: doc.targetUrl });
});

// GET register a view
router.get('/register-view', async (req, res) => {
  const popup = parseInt(req.query.popup, 10);
  await EVENTS.insertOne({ popup, type: 'view', ts: new Date() });
  return res.sendStatus(200);
});

// GET register a click
router.get('/register-click', async (req, res) => {
  const popup = parseInt(req.query.popup, 10);
  await EVENTS.insertOne({ popup, type: 'click', ts: new Date() });
  return res.sendStatus(200);
});

// POST update popup order
router.post('/order', async (req, res) => {
  const userId = req.user._id;
  let orders = req.body.order || [];
  let popups = req.body.popup || [];

  // Ensure arrays
  if (!Array.isArray(orders)) orders = [orders];
  if (!Array.isArray(popups)) popups = [popups];

  // Update each popup's order for this user
  for (let i = 0; i < popups.length; i++) {
    const p = parseInt(popups[i], 10);
    const o = parseInt(orders[i], 10);
    await POPUPS.updateOne({ popup: p, userId }, { $set: { order: o } });
  }

  // Re-normalize: fetch all popups for this user, sort by 'order', and reassign order fields
  const userPopups = await POPUPS.find({ userId }).sort({ order: 1 }).toArray();
  for (let i = 0; i < userPopups.length; i++) {
    await POPUPS.updateOne({ _id: userPopups[i]._id }, { $set: { order: i + 1 } });
  }

  return res.sendStatus(200);
});

// POST save (create up to 2, or update existing), now with file upload
router.post('/save', upload.single('image'), async (req, res) => {
  // ...existing code up to parsing...
  const pNum = parseInt(req.body.popup, 10);
  let { targetUrl } = req.body;
  let imageUrl = req.body.imageUrl; // fallback if no file
  if (req.file) {
    imageUrl = await handleFileUpload(req.file, global.db);
  }
  const userId = req.user._id;
  if (isNaN(pNum)) {
    // create
    const count = await POPUPS.countDocuments({ userId });
    if (count >= 2) return res.status(400).json({ error: 'Max popups reached' });
    const next = count + 1;
    await POPUPS.insertOne({ popup: next, imageUrl, targetUrl, order: next, userId });
  } else {
    // update
    await POPUPS.updateOne({ popup: pNum, userId }, { $set: { imageUrl, targetUrl } });
  }
  return res.json({ imageUrl });
});

// DELETE popup
router.delete('/:popup', async (req, res) => {
  const popup = parseInt(req.params.popup, 10);
  const userId = req.user._id;
  const result = await POPUPS.deleteOne({ popup, userId });
  if (result.deletedCount === 0) {
    return res.status(404).json({ error: 'Not found' });
  }
  return res.sendStatus(200);
});

// GET API metadata
router.get('/about', (req, res) => {
  res.json({ app: 'referal', version: '1.0.0', description: 'Referral popups API' });
});

module.exports = router;
