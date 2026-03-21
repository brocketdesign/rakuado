const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const multer = require('multer');
const ensureAuthenticated = require('../../middleware/authMiddleware');
const ensureMembership = require('../../middleware/ensureMembership');
const { sendEmail, sendRawEmail } = require('../../services/email');
const { uploadFileToS3 } = require('../../services/aws');
const https = require('https');
const http = require('http');

// Multer setup for welcome email attachments
const welcomeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png',
      'image/jpeg',
      'image/gif'
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed. Accepted: PDF, TXT, DOC, DOCX, PNG, JPG, GIF'));
    }
  }
});

// ── Helpers ──────────────────────────────────────────────────────
function sanitizeServiceConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return {};
  return {
    serviceName: String(cfg.serviceName || '').trim().slice(0, 200),
    headline:    String(cfg.headline    || '').trim().slice(0, 300),
    subtext:     String(cfg.subtext     || '').trim().slice(0, 300),
    extraDays:   Math.max(0, parseInt(cfg.extraDays, 10) || 0),
    accentHex:   String(cfg.accentHex   || '').trim().slice(0, 20),
    logoUrl:     String(cfg.logoUrl     || '').trim().slice(0, 5000)
  };
}

// ── Public endpoint — fetch activated mailing list for external apps ──
// GET /api/mailing-lists/active/:userId
// No auth required. Returns only list ID + serviceConfig for popup generation.
router.get('/active/:userId', async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.userId)) {
      return res.status(400).json({ success: false, error: 'Invalid user ID' });
    }

    const userId = new ObjectId(req.params.userId);
    const settings = await global.db.collection('userSettings').findOne({ userId });

    if (!settings || !settings.activeMailingListId) {
      return res.json({ success: true, mailingList: null });
    }

    const list = await global.db.collection('mailingLists').findOne({
      _id: new ObjectId(settings.activeMailingListId),
      userId
    });

    if (!list) {
      await global.db.collection('userSettings').updateOne(
        { userId },
        { $unset: { activeMailingListId: '' } }
      );
      return res.json({ success: true, mailingList: null });
    }

    res.json({
      success: true,
      mailingList: {
        _id: list._id,
        name: list.name,
        description: list.description,
        serviceConfig: list.serviceConfig || {}
      }
    });
  } catch (error) {
    console.error('Error fetching active mailing list:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch active mailing list' });
  }
});

// ── Admin routes (require auth) ──────────────────────────────────

// GET active mailing list for dashboard (authenticated)
router.get('/active', ensureAuthenticated, ensureMembership, async (req, res) => {
  try {
    const userId = new ObjectId(req.user._id);
    const settings = await global.db.collection('userSettings').findOne({ userId });

    if (!settings || !settings.activeMailingListId) {
      return res.json({ success: true, mailingList: null });
    }

    const list = await global.db.collection('mailingLists').findOne({
      _id: new ObjectId(settings.activeMailingListId),
      userId
    });

    if (!list) {
      await global.db.collection('userSettings').updateOne(
        { userId },
        { $unset: { activeMailingListId: '' } }
      );
      return res.json({ success: true, mailingList: null });
    }

    res.json({ success: true, mailingList: list });
  } catch (error) {
    console.error('Error fetching active mailing list:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch active mailing list' });
  }
});

// POST activate a mailing list for the current user
router.post('/activate/:id', ensureAuthenticated, ensureMembership, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid mailing list ID' });
    }

    const userId = new ObjectId(req.user._id);
    const listId = new ObjectId(req.params.id);

    // Verify the list belongs to the user
    const list = await global.db.collection('mailingLists').findOne({ _id: listId, userId });
    if (!list) {
      return res.status(404).json({ success: false, error: 'Mailing list not found' });
    }

    await global.db.collection('userSettings').updateOne(
      { userId },
      { $set: { activeMailingListId: listId.toString(), updatedAt: new Date() } },
      { upsert: true }
    );

    res.json({ success: true, activeMailingListId: listId.toString() });
  } catch (error) {
    console.error('Error activating mailing list:', error);
    res.status(500).json({ success: false, error: 'Failed to activate mailing list' });
  }
});

// POST deactivate the currently active mailing list
router.post('/deactivate', ensureAuthenticated, ensureMembership, async (req, res) => {
  try {
    const userId = new ObjectId(req.user._id);

    await global.db.collection('userSettings').updateOne(
      { userId },
      { $unset: { activeMailingListId: '' }, $set: { updatedAt: new Date() } },
      { upsert: true }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error deactivating mailing list:', error);
    res.status(500).json({ success: false, error: 'Failed to deactivate mailing list' });
  }
});

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
    const { name, description, serviceConfig } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Mailing list name is required' });
    }

    const newList = {
      userId: new ObjectId(req.user._id),
      name: name.trim(),
      description: (description || '').trim(),
      serviceConfig: sanitizeServiceConfig(serviceConfig),
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
    const { name, description, serviceConfig } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Mailing list name is required' });
    }

    const result = await global.db.collection('mailingLists').updateOne(
      { _id: new ObjectId(req.params.id), userId: new ObjectId(req.user._id) },
      { $set: { name: name.trim(), description: (description || '').trim(), serviceConfig: sanitizeServiceConfig(serviceConfig), updatedAt: new Date() } }
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

// ── Welcome Email routes ─────────────────────────────────────────

// GET welcome email config for a list
router.get('/:id/welcome-email', ensureAuthenticated, ensureMembership, async (req, res) => {
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
    res.json({ success: true, welcomeEmail: list.welcomeEmail || null });
  } catch (error) {
    console.error('Error fetching welcome email:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch welcome email' });
  }
});

// PUT save/update welcome email config
router.put('/:id/welcome-email', ensureAuthenticated, ensureMembership, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid mailing list ID' });
    }
    const { subject, htmlBody, enabled } = req.body;
    if (!subject || !subject.trim()) {
      return res.status(400).json({ success: false, error: 'Subject is required' });
    }
    if (!htmlBody || !htmlBody.trim()) {
      return res.status(400).json({ success: false, error: 'Email body is required' });
    }

    const list = await global.db.collection('mailingLists').findOne({
      _id: new ObjectId(req.params.id),
      userId: new ObjectId(req.user._id)
    });
    if (!list) {
      return res.status(404).json({ success: false, error: 'Mailing list not found' });
    }

    // Preserve existing attachment if any
    const existing = list.welcomeEmail || {};
    const update = {
      'welcomeEmail.subject': subject.trim(),
      'welcomeEmail.htmlBody': htmlBody.trim(),
      'welcomeEmail.enabled': enabled !== false,
      'welcomeEmail.updatedAt': new Date()
    };
    // Keep attachment if it already exists and we're not removing it
    if (existing.attachment && !update['welcomeEmail.attachment']) {
      update['welcomeEmail.attachment'] = existing.attachment;
    }

    await global.db.collection('mailingLists').updateOne(
      { _id: new ObjectId(req.params.id), userId: new ObjectId(req.user._id) },
      { $set: update }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error saving welcome email:', error);
    res.status(500).json({ success: false, error: 'Failed to save welcome email' });
  }
});

// POST upload attachment for welcome email
router.post('/:id/welcome-email/attachment', ensureAuthenticated, ensureMembership, welcomeUpload.single('attachment'), async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid mailing list ID' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const list = await global.db.collection('mailingLists').findOne({
      _id: new ObjectId(req.params.id),
      userId: new ObjectId(req.user._id)
    });
    if (!list) {
      return res.status(404).json({ success: false, error: 'Mailing list not found' });
    }

    // Upload to S3
    const s3Key = `mailing-lists/${req.params.id}/welcome-attachment-${Date.now()}-${req.file.originalname}`;
    const s3Result = await uploadFileToS3(req.file.buffer, s3Key);

    const attachment = {
      url: s3Result.url,
      s3Key: s3Key,
      filename: req.file.originalname,
      contentType: req.file.mimetype,
      size: req.file.size
    };

    await global.db.collection('mailingLists').updateOne(
      { _id: new ObjectId(req.params.id), userId: new ObjectId(req.user._id) },
      { $set: { 'welcomeEmail.attachment': attachment } }
    );

    res.json({ success: true, attachment });
  } catch (error) {
    console.error('Error uploading attachment:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to upload attachment' });
  }
});

// DELETE remove attachment from welcome email
router.delete('/:id/welcome-email/attachment', ensureAuthenticated, ensureMembership, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid mailing list ID' });
    }

    const result = await global.db.collection('mailingLists').updateOne(
      { _id: new ObjectId(req.params.id), userId: new ObjectId(req.user._id) },
      { $unset: { 'welcomeEmail.attachment': '' } }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, error: 'Mailing list not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error removing attachment:', error);
    res.status(500).json({ success: false, error: 'Failed to remove attachment' });
  }
});

// DELETE remove entire welcome email config
router.delete('/:id/welcome-email', ensureAuthenticated, ensureMembership, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid mailing list ID' });
    }

    const result = await global.db.collection('mailingLists').updateOne(
      { _id: new ObjectId(req.params.id), userId: new ObjectId(req.user._id) },
      { $unset: { welcomeEmail: '' } }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, error: 'Mailing list not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting welcome email:', error);
    res.status(500).json({ success: false, error: 'Failed to delete welcome email' });
  }
});

// Helper: download a file from URL into a Buffer
function downloadFileToBuffer(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return downloadFileToBuffer(response.headers.location).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        return reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
      }
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

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

    // Send welcome email to the new subscriber if configured
    try {
      if (list.welcomeEmail && list.welcomeEmail.enabled && list.welcomeEmail.subject && list.welcomeEmail.htmlBody) {
        let attachments = [];
        if (list.welcomeEmail.attachment && list.welcomeEmail.attachment.url) {
          try {
            const fileBuffer = await downloadFileToBuffer(list.welcomeEmail.attachment.url);
            attachments.push({
              filename: list.welcomeEmail.attachment.filename,
              content: fileBuffer,
              contentType: list.welcomeEmail.attachment.contentType
            });
          } catch (dlErr) {
            console.error('Error downloading welcome email attachment:', dlErr.message);
          }
        }
        await sendRawEmail(cleanEmail, list.welcomeEmail.subject, list.welcomeEmail.htmlBody, attachments);
        console.log(`Welcome email sent to ${cleanEmail} for list ${list.name}`);
      }
    } catch (welcomeErr) {
      console.error('Error sending welcome email:', welcomeErr);
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

    // Send welcome email to the new subscriber if configured
    try {
      if (list.welcomeEmail && list.welcomeEmail.enabled && list.welcomeEmail.subject && list.welcomeEmail.htmlBody) {
        let attachments = [];
        if (list.welcomeEmail.attachment && list.welcomeEmail.attachment.url) {
          try {
            const fileBuffer = await downloadFileToBuffer(list.welcomeEmail.attachment.url);
            attachments.push({
              filename: list.welcomeEmail.attachment.filename,
              content: fileBuffer,
              contentType: list.welcomeEmail.attachment.contentType
            });
          } catch (dlErr) {
            console.error('Error downloading welcome email attachment:', dlErr.message);
          }
        }
        await sendRawEmail(cleanEmail, list.welcomeEmail.subject, list.welcomeEmail.htmlBody, attachments);
        console.log(`Welcome email sent to ${cleanEmail} for list ${list.name}`);
      }
    } catch (welcomeErr) {
      console.error('Error sending welcome email:', welcomeErr);
    }

    res.json({ success: true, message: 'Subscribed successfully' });
  } catch (error) {
    console.error('Error subscribing:', error);
    res.status(500).json({ success: false, error: 'Failed to subscribe' });
  }
});

module.exports = router;
