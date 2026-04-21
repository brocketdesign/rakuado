/**
 * Admin Notification Service
 *
 * Manages email notifications sent to the admin at key business events.
 * Each notification type can be enabled or disabled via the `emailConfig`
 * MongoDB collection, and can be tested from the admin dashboard.
 */

const { sendEmail } = require('./email');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'didier@hatoltd.com';

/**
 * Default notification definitions.
 * These are seeded into the DB if not already present.
 */
const DEFAULT_NOTIFICATIONS = [
  {
    key: 'new_user_signup',
    name: 'New User Signup',
    description: 'Sent when any new user creates an account.',
    template: 'admin-new-user',
    category: 'users',
    enabled: true,
  },
  {
    key: 'new_advertiser_registration',
    name: 'New Advertiser Registration',
    description: 'Sent when an advertiser sets up their advertiser profile.',
    template: 'admin-new-advertiser',
    category: 'advertisers',
    enabled: true,
  },
  {
    key: 'advertiser_deposit',
    name: 'Advertiser Budget Deposit',
    description: 'Sent when an advertiser deposits money into their ad budget.',
    template: 'admin-advertiser-deposit',
    category: 'advertisers',
    enabled: true,
  },
  {
    key: 'campaign_submitted',
    name: 'Campaign Submitted for Review',
    description: 'Sent when an advertiser submits a campaign for admin review.',
    template: 'admin-campaign-submitted',
    category: 'advertisers',
    enabled: true,
  },
  {
    key: 'new_partner_application',
    name: 'New Partner Application',
    description: 'Sent when a partner submits a new site application.',
    template: 'admin-new-partner',
    category: 'partners',
    enabled: true,
  },
  {
    key: 'partner_request_approved',
    name: 'Partner Request Approved',
    description: 'Sent when an admin approves a partner site application.',
    template: 'admin-new-partner',
    category: 'partners',
    enabled: true,
  },
  {
    key: 'advertiser_campaign_approved',
    name: 'Advertiser Campaign Approved',
    description: 'Sent when an admin approves an advertiser campaign for delivery.',
    template: 'admin-campaign-submitted',
    category: 'advertisers',
    enabled: true,
  },
];

/**
 * Seed default notification configs into MongoDB if they don't exist yet.
 * Called once on app startup.
 */
async function seedEmailConfig() {
  try {
    const collection = global.db.collection('emailConfig');
    for (const notif of DEFAULT_NOTIFICATIONS) {
      await collection.updateOne(
        { key: notif.key },
        { $setOnInsert: { ...notif, createdAt: new Date(), updatedAt: new Date() } },
        { upsert: true }
      );
    }
    console.log('✅ Email config seeded');
  } catch (err) {
    console.error('Email config seed error:', err);
  }
}

/**
 * Check if a notification is enabled.
 * @param {string} key  - notification key (e.g. 'new_user_signup')
 * @returns {Promise<boolean>}
 */
async function isNotificationEnabled(key) {
  try {
    const doc = await global.db.collection('emailConfig').findOne({ key });
    if (!doc) return false; // unknown key → disabled by default
    return doc.enabled === true;
  } catch {
    return false;
  }
}

/**
 * Send an admin notification if the event is enabled.
 * Fails silently – never throws so it never blocks the main request.
 *
 * @param {string} key      - notification key
 * @param {object} locals   - template variables
 */
async function notifyAdmin(key, locals = {}) {
  try {
    const enabled = await isNotificationEnabled(key);
    if (!enabled) return;

    const config = DEFAULT_NOTIFICATIONS.find((n) => n.key === key);
    if (!config) return;

    await sendEmail(ADMIN_EMAIL, config.template, { ...locals, adminEmail: ADMIN_EMAIL });
  } catch (err) {
    console.error(`Admin notification error [${key}]:`, err.message);
  }
}

module.exports = { seedEmailConfig, notifyAdmin, DEFAULT_NOTIFICATIONS, ADMIN_EMAIL };
