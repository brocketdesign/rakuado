const express = require('express');
const router = express.Router();
const db = global.db;
const POPUPS = db.collection('referalPopups');
const EVENTS = db.collection('referalEvents');

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
  const orders = req.body.order || [];
  const popups = req.body.popup || [];
  for (let i = 0; i < popups.length; i++) {
    const p = parseInt(popups[i], 10);
    const o = parseInt(orders[i], 10);
    await POPUPS.updateOne({ popup: p }, { $set: { order: o } });
  }
  return res.sendStatus(200);
});

// POST save (create up to 2, or update existing)
router.post('/save', async (req, res) => {
  const pNum = parseInt(req.body.popup, 10);
  const { imageUrl, targetUrl } = req.body;
  if (isNaN(pNum)) {
    const count = await POPUPS.countDocuments();
    if (count >= 2) return res.status(400).json({ error: 'Max popups reached' });
    const next = count + 1;
    await POPUPS.insertOne({ popup: next, imageUrl, targetUrl, order: next });
  } else {
    await POPUPS.updateOne(
      { popup: pNum },
      { $set: { imageUrl, targetUrl } }
    );
  }
  return res.redirect('/dashboard/app/referal');
});

// GET API metadata
router.get('/about', (req, res) => {
  res.json({ app: 'referal', version: '1.0.0', description: 'Referral popups API' });
});

module.exports = router;
