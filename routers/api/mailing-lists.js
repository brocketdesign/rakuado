const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const ensureAuthenticated = require('../../middleware/authMiddleware');
const ensureMembership = require('../../middleware/ensureMembership');
const { sendEmail } = require('../../services/email');

// ── Admin routes (require auth) ──────────────────────────────────

// GET all mailing lists for the current user
router.get('/', ensureAuthenticated, ensureMembership, async (req, res) => {
  try {
    const lists = await global.db.collection('mailingLists')
      .find({ userId: new ObjectId(req.user._id) })
      .sort({ createdAt: -1 })
      .toArray();
    res.json({ success: true, mailingLists: lists });
  } catch (error) {
    console.error('Error fetching mailing lists:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch mailing lists' });
  }
});

// GET a single mailing list with its subscribers
router.get('/:id', ensureAuthenticated, ensureMembership, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid mailing list ID' });
    }
    const list = await global.db.collection('mailingLists').findOne({
      _id: new ObjectId(req.params.id),
      userId: new ObjectId(req.user._id)
    });
    if (!list) {
      return res.status(404).json({ success: false, error: 'Mailing list not found' });
    }

    const subscribers = await global.db.collection('mailingListSubscribers')
      .find({ listId: new ObjectId(req.params.id) })
      .sort({ subscribedAt: -1 })
      .toArray();

    res.json({ success: true, mailingList: list, subscribers });
  } catch (error) {
    console.error('Error fetching mailing list:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch mailing list' });
  }
});

// POST create a new mailing list
router.post('/', ensureAuthenticated, ensureMembership, async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Mailing list name is required' });
    }

    const newList = {
      userId: new ObjectId(req.user._id),
      name: name.trim(),
      description: (description || '').trim(),
      subscriberCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await global.db.collection('mailingLists').insertOne(newList);
    newList._id = result.insertedId;

    res.json({ success: true, mailingList: newList });
  } catch (error) {
    console.error('Error creating mailing list:', error);
    res.status(500).json({ success: false, error: 'Failed to create mailing list' });
  }
});

// PUT update a mailing list
router.put('/:id', ensureAuthenticated, ensureMembership, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid mailing list ID' });
    }
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Mailing list name is required' });
    }

    const result = await global.db.collection('mailingLists').updateOne(
      { _id: new ObjectId(req.params.id), userId: new ObjectId(req.user._id) },
      { $set: { name: name.trim(), description: (description || '').trim(), updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, error: 'Mailing list not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating mailing list:', error);
    res.status(500).json({ success: false, error: 'Failed to update mailing list' });
  }
});

// DELETE a mailing list and all its subscribers
router.delete('/:id', ensureAuthenticated, ensureMembership, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid mailing list ID' });
    }
    const listId = new ObjectId(req.params.id);
    const userId = new ObjectId(req.user._id);

    const result = await global.db.collection('mailingLists').deleteOne({ _id: listId, userId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, error: 'Mailing list not found' });
    }

    // Remove all subscribers in this list
    await global.db.collection('mailingListSubscribers').deleteMany({ listId });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting mailing list:', error);
    res.status(500).json({ success: false, error: 'Failed to delete mailing list' });
  }
});

// DELETE a single subscriber
router.delete('/:id/subscribers/:subscriberId', ensureAuthenticated, ensureMembership, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id) || !ObjectId.isValid(req.params.subscriberId)) {
      return res.status(400).json({ success: false, error: 'Invalid ID' });
    }

    // Verify ownership of the list
    const list = await global.db.collection('mailingLists').findOne({
      _id: new ObjectId(req.params.id),
      userId: new ObjectId(req.user._id)
    });
    if (!list) {
      return res.status(404).json({ success: false, error: 'Mailing list not found' });
    }

    const result = await global.db.collection('mailingListSubscribers').deleteOne({
      _id: new ObjectId(req.params.subscriberId),
      listId: new ObjectId(req.params.id)
    });

    if (result.deletedCount > 0) {
      await global.db.collection('mailingLists').updateOne(
        { _id: new ObjectId(req.params.id) },
        { $inc: { subscriberCount: -1 } }
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting subscriber:', error);
    res.status(500).json({ success: false, error: 'Failed to delete subscriber' });
  }
});

// ── Public endpoint – add email to a mailing list ────────────────
// POST /api/mailing-lists/subscribe/:listId
// Body: { email, tag? }
// No authentication required (this is the form endpoint)
router.post('/subscribe/:listId', async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.listId)) {
      return res.status(400).json({ success: false, error: 'Invalid mailing list ID' });
    }

    const { email, tag, domain } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ success: false, error: 'Invalid email address' });
    }

    const listId = new ObjectId(req.params.listId);

    // Verify the list exists
    const list = await global.db.collection('mailingLists').findOne({ _id: listId });
    if (!list) {
      return res.status(404).json({ success: false, error: 'Mailing list not found' });
    }

    // Check for duplicate email in this list
    const existing = await global.db.collection('mailingListSubscribers').findOne({
      listId,
      email: email.trim().toLowerCase()
    });

    if (existing) {
      // If same email exists but with a different tag, add the tag
      if (tag && tag.trim() && (!existing.tags || !existing.tags.includes(tag.trim()))) {
        await global.db.collection('mailingListSubscribers').updateOne(
          { _id: existing._id },
          { $addToSet: { tags: tag.trim() } }
        );
      }
      return res.json({ success: true, message: 'Already subscribed' });
    }

    const cleanEmail = email.trim().toLowerCase();

    const subscriber = {
      listId,
      email: cleanEmail,
      domain: (domain || '').trim(),
      tags: tag && tag.trim() ? [tag.trim()] : [],
      subscribedAt: new Date(),
      ip: req.ip
    };

    await global.db.collection('mailingListSubscribers').insertOne(subscriber);

    // Increment subscriber count
    const updatedList = await global.db.collection('mailingLists').findOneAndUpdate(
      { _id: listId },
      { $inc: { subscriberCount: 1 } },
      { returnDocument: 'after' }
    );

    // Send admin notification email
    try {
      const adminEmail = process.env.ADMIN_EMAIL;
      if (adminEmail) {
        await sendEmail(adminEmail, 'new subscriber admin', {
          email: cleanEmail,
          listName: list.name || 'Unnamed List',
          subscriberCount: updatedList.subscriberCount || (list.subscriberCount + 1),
          tags: subscriber.tags.length ? subscriber.tags.join(', ') : '',
          domain: subscriber.domain || '',
          subscribedAt: new Date().toLocaleString('en-US'),
          category: 'Admin Notification'
        });
      }
    } catch (emailError) {
      console.error('Error sending admin subscriber notification:', emailError);
    }

    res.json({ success: true, message: 'Subscribed successfully' });
  } catch (error) {
    console.error('Error subscribing:', error);
    res.status(500).json({ success: false, error: 'Failed to subscribe' });
  }
});

// GET public endpoint (for form action with GET support)
// /api/mailing-lists/subscribe/:listId?email=...&tag=...
router.get('/subscribe/:listId', async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.listId)) {
      return res.status(400).json({ success: false, error: 'Invalid mailing list ID' });
    }

    const { email, tag, domain } = req.query;

    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ success: false, error: 'Invalid email address' });
    }

    const listId = new ObjectId(req.params.listId);

    const list = await global.db.collection('mailingLists').findOne({ _id: listId });
    if (!list) {
      return res.status(404).json({ success: false, error: 'Mailing list not found' });
    }

    const existing = await global.db.collection('mailingListSubscribers').findOne({
      listId,
      email: email.trim().toLowerCase()
    });

    if (existing) {
      if (tag && tag.trim() && (!existing.tags || !existing.tags.includes(tag.trim()))) {
        await global.db.collection('mailingListSubscribers').updateOne(
          { _id: existing._id },
          { $addToSet: { tags: tag.trim() } }
        );
      }
      return res.json({ success: true, message: 'Already subscribed' });
    }

    const cleanEmail = email.trim().toLowerCase();

    const subscriber = {
      listId,
      email: cleanEmail,
      domain: (domain || '').trim(),
      tags: tag && tag.trim() ? [tag.trim()] : [],
      subscribedAt: new Date(),
      ip: req.ip
    };

    await global.db.collection('mailingListSubscribers').insertOne(subscriber);

    const updatedList = await global.db.collection('mailingLists').findOneAndUpdate(
      { _id: listId },
      { $inc: { subscriberCount: 1 } },
      { returnDocument: 'after' }
    );

    // Send admin notification email
    try {
      const adminEmail = process.env.ADMIN_EMAIL;
      if (adminEmail) {
        await sendEmail(adminEmail, 'new subscriber admin', {
          email: cleanEmail,
          listName: list.name || 'Unnamed List',
          subscriberCount: updatedList.subscriberCount || (list.subscriberCount + 1),
          tags: subscriber.tags.length ? subscriber.tags.join(', ') : '',
          domain: subscriber.domain || '',
          subscribedAt: new Date().toLocaleString('en-US'),
          category: 'Admin Notification'
        });
      }
    } catch (emailError) {
      console.error('Error sending admin subscriber notification:', emailError);
    }

    res.json({ success: true, message: 'Subscribed successfully' });
  } catch (error) {
    console.error('Error subscribing:', error);
    res.status(500).json({ success: false, error: 'Failed to subscribe' });
  }
});

module.exports = router;
