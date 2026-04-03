const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const ensureAuthenticated = require('../../middleware/authMiddleware');

router.use(ensureAuthenticated);

// GET /feeds -- list all RSS feeds
router.get('/feeds', async (req, res) => {
  try {
    const feeds = await global.db.collection('feeds').find({}).sort({ _id: -1 }).toArray();
    res.json(feeds);
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /feeds -- add a new RSS feed
router.post('/feeds', async (req, res) => {
  try {
    const { url, name } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    const result = await global.db.collection('feeds').insertOne({
      url,
      name: name || url,
      status: 'active',
      createdAt: new Date(),
      lastScraped: null,
    });
    res.status(201).json({ _id: result.insertedId, url, name, status: 'active' });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /feeds/:id -- update feed (e.g. toggle status)
router.put('/feeds/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
    const { status, name, url } = req.body;
    const update = {};
    if (status !== undefined) update.status = status;
    if (name !== undefined) update.name = name;
    if (url !== undefined) update.url = url;
    await global.db.collection('feeds').updateOne({ _id: new ObjectId(id) }, { $set: update });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /feeds/:id -- delete a feed
router.delete('/feeds/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
    await global.db.collection('feeds').deleteOne({ _id: new ObjectId(id) });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
