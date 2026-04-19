const express = require('express');
const router = express.Router();
const ensureAuthenticated = require('../../middleware/authMiddleware');
const { sendEmail } = require('../../services/email');
const { DEFAULT_NOTIFICATIONS, ADMIN_EMAIL } = require('../../services/adminNotifications');

// All routes require authentication + admin
router.use(ensureAuthenticated);
router.use((req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
});

// GET /api/admin/email-config
// Returns all notification configs (merges DB overrides with defaults)
router.get('/email-config', async (req, res) => {
  try {
    const collection = global.db.collection('emailConfig');
    const dbConfigs = await collection.find({}).toArray();
    const dbMap = Object.fromEntries(dbConfigs.map((c) => [c.key, c]));

    // Merge defaults with DB state (DB wins on enabled/disabled)
    const configs = DEFAULT_NOTIFICATIONS.map((def) => {
      const db = dbMap[def.key];
      return {
        ...def,
        enabled: db ? db.enabled : def.enabled,
        lastTestAt: db?.lastTestAt || null,
        updatedAt: db?.updatedAt || null,
      };
    });

    res.json({ configs });
  } catch (err) {
    console.error('GET /api/admin/email-config', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/email-config/:key
// Enable or disable a notification
router.put('/email-config/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: '`enabled` must be a boolean' });
    }

    const validKeys = DEFAULT_NOTIFICATIONS.map((n) => n.key);
    if (!validKeys.includes(key)) {
      return res.status(404).json({ error: 'Unknown notification key' });
    }

    const collection = global.db.collection('emailConfig');
    const def = DEFAULT_NOTIFICATIONS.find((n) => n.key === key);

    await collection.updateOne(
      { key },
      {
        $set: { enabled, updatedAt: new Date() },
        $setOnInsert: { ...def, createdAt: new Date() },
      },
      { upsert: true }
    );

    res.json({ ok: true, key, enabled });
  } catch (err) {
    console.error('PUT /api/admin/email-config/:key', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/email-config/:key/test
// Send a test email to the admin using the notification's template
router.post('/email-config/:key/test', async (req, res) => {
  try {
    const { key } = req.params;
    const { testEmail } = req.body; // optional override address

    const config = DEFAULT_NOTIFICATIONS.find((n) => n.key === key);
    if (!config) {
      return res.status(404).json({ error: 'Unknown notification key' });
    }

    const recipient = testEmail || ADMIN_EMAIL;

    // Build sample template locals for each notification type
    const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    const sampleLocals = {
      new_user_signup: {
        email: 'test.user@example.com',
        username: 'testuser123',
        signupDate: now,
      },
      new_advertiser_registration: {
        companyName: 'Test Company Ltd.',
        contactName: 'Jane Doe',
        email: 'jane@testcompany.com',
        website: 'https://testcompany.com',
        registeredAt: now,
      },
      advertiser_deposit: {
        companyName: 'Test Company Ltd.',
        email: 'jane@testcompany.com',
        amount: '100,000',
        stripeSessionId: 'cs_test_xxxxxxxxxxxxxxxxxxxx',
        depositedAt: now,
      },
      campaign_submitted: {
        campaignName: 'Summer Sale Banner Campaign',
        campaignType: 'banner',
        companyName: 'Test Company Ltd.',
        email: 'jane@testcompany.com',
        dailyBudget: '10,000',
        submittedAt: now,
      },
      new_partner_application: {
        email: 'blogger@example.com',
        blogUrl: 'https://myblog.example.com',
        message: 'I have been blogging for 3 years with 50k monthly visitors.',
        appliedAt: now,
      },
    };

    const locals = sampleLocals[key] || { message: `Test email for: ${config.name}` };

    await sendEmail(recipient, config.template, { ...locals, isTest: true });

    // Record last test timestamp
    await global.db.collection('emailConfig').updateOne(
      { key },
      { $set: { lastTestAt: new Date(), updatedAt: new Date() } },
      { upsert: true }
    );

    res.json({ ok: true, sentTo: recipient });
  } catch (err) {
    console.error('POST /api/admin/email-config/:key/test', err);
    res.status(500).json({ error: `Failed to send test email: ${err.message}` });
  }
});

module.exports = router;
