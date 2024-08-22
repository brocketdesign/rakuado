// Assuming Express setup is already done
const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

router.post('/feeds', async (req, res) => {
  const { url, name } = req.body;

  // Basic validation
  if (!url) {
    return res.status(400).send({ message: 'URL is required' });
  }

  try {
    // Check if the feed already exists
    const existingFeed = await global.db.collection('feeds').findOne({ url });
    if (existingFeed) {
      return res.status(409).send({ message: 'Feed already exists' });
    }

    // Insert new feed
    const result = await global.db.collection('feeds').insertOne({ url, name, userId: req.user._id, status: 'active' });
    res.status(201).send({ message: 'Feed added successfully', id: result.insertedId });
  } catch (error) {
    res.status(500).send({ message: 'Server error', error });
  }
});

router.get('/feeds', async (req, res) => {
    try {
      const feeds = await global.db.collection('feeds').find({userId:new ObjectId(req.user._id)}).toArray();
      res.status(200).send(feeds);
    } catch (error) {
      res.status(500).send({ message: 'Server error', error });
    }
  });

  router.put('/feeds/:id', async (req, res) => {
    const { id } = req.params;
    const { url, name } = req.body;

    try {
      const result = await global.db.collection('feeds').updateOne(
        { _id: new ObjectId(id) },
        { $set: { url, name } }
      );
  
      if (result.matchedCount === 0) {
        return res.status(404).send({ message: 'Feed not found' });
      }
  
      res.status(200).send({ message: 'Feed updated successfully' });
    } catch (error) {
      res.status(500).send({ message: 'Server error', error });
    }
  });
  router.patch('/feeds/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // Expecting 'active' or 'paused'
  
    if (!['active', 'paused'].includes(status)) {
      return res.status(400).send({ message: 'Invalid status' });
    }
  
    try {
      const result = await global.db.collection('feeds').updateOne(
        { _id: new ObjectId(id) },
        { $set: { status } }
      );
  
      if (result.matchedCount === 0) {
        return res.status(404).send({ message: 'Feed not found' });
      }
  
      res.status(200).send({ message: `Feed ${status} successfully` });
    } catch (error) {
      res.status(500).send({ message: 'Server error', error });
    }
  });
  
  router.delete('/feeds/:id', async (req, res) => {
    const { id } = req.params;
  
    try {
      const result = await global.db.collection('feeds').deleteOne({ _id: new ObjectId(id) });
  
      if (result.deletedCount === 0) {
        return res.status(404).send({ message: 'Feed not found' });
      }
  
      res.status(200).send({ message: 'Feed deleted successfully' });
    } catch (error) {
      res.status(500).send({ message: 'Server error', error });
    }
  });
  
  // Manage articles
  const { getOrUpdateArticles } = require('../../modules/feedScraper');

  router.get('/feeds/:feedId/articles', async (req, res) => {
    const { feedId } = req.params;

    if (!ObjectId.isValid(feedId)) {
      return res.status(400).send({ message: 'Invalid feed ID' });
    }
  
    try {
      console.log(`getOrUpdateArticles ${feedId}`)
      const articles = await getOrUpdateArticles(feedId);
      res.status(200).send(articles);
    } catch (error) {
      console.error('Error getting or updating articles: ', error);
      res.status(500).send({ message: 'Server error', error: error.message });
    }
  });
  router.get('/articles/:articleId', async (req, res) => {
    const { articleId } = req.params;
  
    if (!ObjectId.isValid(articleId)) {
      return res.status(400).send({ message: 'Invalid article ID' });
    }
  
    try {
      const article = await global.db.collection('articles').findOne({
        _id: new ObjectId(articleId)
      });
  
      if (!article) {
        return res.status(404).send({ message: 'Article not found' });
      }
  
      res.status(200).send(article);
    } catch (error) {
      res.status(500).send({ message: 'Server error', error });
    }
  });
  router.put('/articles/:articleId', async (req, res) => {
    const { articleId } = req.params;
    const { title, content } = req.body; // Assuming you're updating title and content
  
    if (!ObjectId.isValid(articleId)) {
      return res.status(400).send({ message: 'Invalid article ID' });
    }
  
    try {
      const result = await global.db.collection('articles').updateOne(
        { _id: new ObjectId(articleId) },
        { $set: { title, content } }
      );
  
      if (result.matchedCount === 0) {
        return res.status(404).send({ message: 'Article not found' });
      }
  
      res.status(200).send({ message: 'Article updated successfully' });
    } catch (error) {
      res.status(500).send({ message: 'Server error', error });
    }
  });
    
  module.exports = router