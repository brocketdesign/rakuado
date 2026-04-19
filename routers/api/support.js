const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const ensureAuthenticated = require('../../middleware/authMiddleware');
const { Resend } = require('resend');

router.use(ensureAuthenticated);

// ── FAQ data ──────────────────────────────────────────────────────────────────
const FAQ = {
  common: [
    {
      id: 'c1',
      category: 'General',
      question: 'What is Rakuado?',
      answer: 'Rakuado is a platform that connects content creators (partners) with advertisers. Partners earn revenue by displaying ads on their sites, and advertisers reach targeted audiences through our partner network.',
    },
    {
      id: 'c2',
      category: 'General',
      question: 'How do I update my account settings?',
      answer: 'Go to Settings in the sidebar. From there you can update your profile information, notification preferences, and security settings.',
    },
    {
      id: 'c3',
      category: 'General',
      question: 'How do I contact support?',
      answer: 'You can open a support ticket directly from this page. Our team typically responds within one business day.',
    },
  ],
  partner: [
    {
      id: 'p1',
      category: 'Partner',
      question: 'How do I install the tracking script?',
      answer: 'In the Partner Portal, go to the "Site Metrics" tab. Copy the script snippet and paste it in the <head> section of every page on your site. Once installed, click "Verify Installation" to confirm.',
    },
    {
      id: 'p2',
      category: 'Partner',
      question: 'How long does approval take?',
      answer: 'After you submit your application, Rakuado collects 72 hours of site data automatically. Our team then reviews your application, which typically takes 1-3 business days.',
    },
    {
      id: 'p3',
      category: 'Partner',
      question: 'How is my monthly payment calculated?',
      answer: 'Payments are calculated on a 21st-to-20th monthly cycle. Your earnings are based on active days your site served ads, multiplied by your agreed monthly rate. You can view your estimated earnings in the Partner Portal under the "Earnings" tab.',
    },
    {
      id: 'p4',
      category: 'Partner',
      question: 'What does each status in the Partner Portal mean?',
      answer: '"Site Registration" – you have registered your site. "Script Installed" – your tracking script has been verified. "Data Collection" – we are collecting 72h of traffic data. "Under Review" – our team is reviewing your application. "Approved" – install the ad snippet. "Active" – your site is serving ads and earning.',
    },
    {
      id: 'p5',
      category: 'Partner',
      question: 'Why is my site showing as inactive?',
      answer: 'A site may show as inactive if the ad snippet is not detected, your site has no recent traffic, or your partnership has been paused by the admin team. Check the Partner Portal for details or open a support ticket.',
    },
  ],
  advertiser: [
    {
      id: 'a1',
      category: 'Advertiser',
      question: 'How do I create my first campaign?',
      answer: 'Navigate to Advertiser Dashboard → Campaigns → New Campaign. Fill in the campaign details, upload your creative assets, set your targeting options, and submit for review. Campaigns are usually approved within 24 hours.',
    },
    {
      id: 'a2',
      category: 'Advertiser',
      question: 'How does budget management work?',
      answer: 'You pre-load your Rakuado wallet using a credit card or bank transfer. Each impression or click deducts from your balance. You can set daily spending caps per campaign. Alerts are sent when your balance falls below your configured threshold.',
    },
    {
      id: 'a3',
      category: 'Advertiser',
      question: 'What targeting options are available?',
      answer: 'Campaigns can be targeted by content category, geographic region, device type, and time of day. More granular targeting options become available as your account history grows.',
    },
    {
      id: 'a4',
      category: 'Advertiser',
      question: 'How do I read my campaign analytics?',
      answer: 'Open any campaign from the Campaigns page to see impressions, clicks, CTR, and spend over time. You can filter by date range and compare performance across campaigns.',
    },
    {
      id: 'a5',
      category: 'Advertiser',
      question: 'Why is my campaign paused?',
      answer: 'Campaigns can be paused automatically if your wallet balance runs out, a creative fails content policy review, or you manually paused it. Check the campaign status badge for the reason, or open a support ticket.',
    },
  ],
  admin: [
    {
      id: 'ad1',
      category: 'Admin',
      question: 'How do I approve a partner application?',
      answer: 'Go to Partner Recruitment in the sidebar. Find the application and check their data metrics. Click "Approve" to move them to the approved status; the system will automatically send them the ad snippet instructions.',
    },
    {
      id: 'ad2',
      category: 'Admin',
      question: 'How do I manage advertiser campaigns?',
      answer: 'Use the Ad Network Management page to review, approve, or reject campaigns. You can also pause live campaigns from there.',
    },
    {
      id: 'ad3',
      category: 'Admin',
      question: 'How does the monthly partner payment cycle work?',
      answer: 'Payments run on a 21-to-20 monthly cycle. The cronjob generates payment drafts automatically. Review them under Partner Payments, then confirm or adjust amounts before sending payment confirmation emails.',
    },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function getAdminEmail() {
  return process.env.ADMIN_SUPPORT_EMAIL || process.env.RESEND_FROM_EMAIL || process.env.MAILTRAP_FROM_EMAIL || null;
}

async function sendResendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return; // silently skip if not configured
  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM_EMAIL
    ? `${process.env.RESEND_FROM_NAME || 'Rakuado Support'} <${process.env.RESEND_FROM_EMAIL}>`
    : 'Rakuado Support <support@rakuado.net>';
  try {
    await resend.emails.send({ from, to: [to], subject, html });
  } catch (err) {
    console.error('[support] email send error:', err.message);
  }
}

// ── GET /api/support/faq ──────────────────────────────────────────────────────
router.get('/faq', async (req, res) => {
  try {
    const user = req.user;
    let items = [...FAQ.common];

    if (user.isAdmin) {
      items = [...FAQ.common, ...FAQ.partner, ...FAQ.advertiser, ...FAQ.admin];
    } else if (user.accountType === 'partner') {
      items = [...FAQ.common, ...FAQ.partner];
    } else if (user.accountType === 'advertiser') {
      items = [...FAQ.common, ...FAQ.advertiser];
    }

    res.json({ success: true, faq: items });
  } catch (err) {
    console.error('[support] faq error:', err);
    res.status(500).json({ success: false, error: 'Failed to load FAQ' });
  }
});

// ── GET /api/support/tickets ──────────────────────────────────────────────────
router.get('/tickets', async (req, res) => {
  try {
    const user = req.user;
    const col = global.db.collection('supportTickets');
    const query = user.isAdmin ? {} : { userId: user._id.toString() };
    const tickets = await col.find(query).sort({ createdAt: -1 }).toArray();

    res.json({
      success: true,
      tickets: tickets.map((t) => ({
        ...t,
        _id: t._id.toString(),
      })),
    });
  } catch (err) {
    console.error('[support] list tickets error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch tickets' });
  }
});

// ── GET /api/support/tickets/:id ──────────────────────────────────────────────
router.get('/tickets/:id', async (req, res) => {
  try {
    const user = req.user;
    const col = global.db.collection('supportTickets');

    let ticket;
    try {
      ticket = await col.findOne({ _id: new ObjectId(req.params.id) });
    } catch {
      return res.status(400).json({ success: false, error: 'Invalid ticket ID' });
    }

    if (!ticket) return res.status(404).json({ success: false, error: 'Ticket not found' });

    // Users can only view their own tickets; admins can view all
    if (!user.isAdmin && ticket.userId !== user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    res.json({ success: true, ticket: { ...ticket, _id: ticket._id.toString() } });
  } catch (err) {
    console.error('[support] get ticket error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch ticket' });
  }
});

// ── POST /api/support/tickets ─────────────────────────────────────────────────
router.post('/tickets', async (req, res) => {
  try {
    const user = req.user;
    const { subject, message } = req.body;

    if (!subject || !subject.trim()) {
      return res.status(400).json({ success: false, error: 'Subject is required' });
    }
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }
    if (subject.length > 200) {
      return res.status(400).json({ success: false, error: 'Subject must be 200 characters or fewer' });
    }
    if (message.length > 5000) {
      return res.status(400).json({ success: false, error: 'Message must be 5000 characters or fewer' });
    }

    const col = global.db.collection('supportTickets');

    // Look up fresh user record to get name/email
    const userRecord = await global.db.collection('users').findOne(
      { _id: new ObjectId(user._id) },
      { projection: { name: 1, email: 1, accountType: 1 } }
    );

    const now = new Date();
    const ticket = {
      userId: user._id.toString(),
      userName: userRecord?.name || 'Unknown',
      accountType: user.isAdmin ? 'admin' : (userRecord?.accountType || user.accountType || 'unknown'),
      subject: subject.trim(),
      message: message.trim(),
      status: 'open',
      replies: [],
      createdAt: now,
      updatedAt: now,
    };

    const result = await col.insertOne(ticket);
    const ticketId = result.insertedId.toString();

    // Notify admin via email (best-effort)
    const adminEmail = getAdminEmail();
    if (adminEmail) {
      await sendResendEmail({
        to: adminEmail,
        subject: `[Rakuado Support] New ticket: ${subject.trim()}`,
        html: `
          <h2>New Support Ticket</h2>
          <p><strong>From:</strong> ${userRecord?.name || 'Unknown'} (${user.isAdmin ? 'Admin' : userRecord?.accountType || 'Unknown'})</p>
          <p><strong>Subject:</strong> ${subject.trim()}</p>
          <p><strong>Message:</strong></p>
          <blockquote style="border-left:4px solid #8b5cf6;padding-left:12px;color:#555">${message.trim().replace(/\n/g, '<br>')}</blockquote>
          <p><a href="${process.env.PRODUCT_URL || ''}/dashboard/support">View ticket in dashboard</a></p>
        `,
      });
    }

    res.json({ success: true, ticketId });
  } catch (err) {
    console.error('[support] create ticket error:', err);
    res.status(500).json({ success: false, error: 'Failed to create ticket' });
  }
});

// ── PUT /api/support/tickets/:id ──────────────────────────────────────────────
// Admin: add reply and/or update status
// User: only allowed to add a reply (no status change)
router.put('/tickets/:id', async (req, res) => {
  try {
    const user = req.user;
    const col = global.db.collection('supportTickets');

    let ticket;
    try {
      ticket = await col.findOne({ _id: new ObjectId(req.params.id) });
    } catch {
      return res.status(400).json({ success: false, error: 'Invalid ticket ID' });
    }
    if (!ticket) return res.status(404).json({ success: false, error: 'Ticket not found' });

    // Access control: user can only interact with their own ticket
    if (!user.isAdmin && ticket.userId !== user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const { replyMessage, status } = req.body;
    const updates = { updatedAt: new Date() };

    // Status update – admin only
    if (status !== undefined) {
      if (!user.isAdmin) {
        return res.status(403).json({ success: false, error: 'Only admins can change ticket status' });
      }
      const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ success: false, error: 'Invalid status' });
      }
      updates.status = status;
    }

    // Reply
    if (replyMessage && replyMessage.trim()) {
      if (replyMessage.length > 5000) {
        return res.status(400).json({ success: false, error: 'Reply must be 5000 characters or fewer' });
      }

      // Look up sender details
      const senderRecord = await global.db.collection('users').findOne(
        { _id: new ObjectId(user._id) },
        { projection: { name: 1 } }
      );

      const reply = {
        replyId: new ObjectId().toString(),
        authorId: user._id.toString(),
        authorName: senderRecord?.name || (user.isAdmin ? 'Admin' : 'User'),
        isAdmin: !!user.isAdmin,
        message: replyMessage.trim(),
        createdAt: new Date(),
      };

      await col.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $push: { replies: reply }, $set: updates }
      );

      // Send email notification to the other party
      const adminEmail = getAdminEmail();
      if (user.isAdmin && adminEmail) {
        // Admin replied → notify ticket owner (we don't expose their email in the UI,
        // but we do look it up server-side to send the notification)
        const ownerRecord = await global.db.collection('users').findOne(
          { _id: new ObjectId(ticket.userId) },
          { projection: { email: 1, name: 1 } }
        );
        if (ownerRecord?.email) {
          await sendResendEmail({
            to: ownerRecord.email,
            subject: `[Rakuado Support] Update on your ticket: ${ticket.subject}`,
            html: `
              <h2>Your support ticket has a new reply</h2>
              <p><strong>Ticket:</strong> ${ticket.subject}</p>
              <p><strong>Reply from Admin:</strong></p>
              <blockquote style="border-left:4px solid #8b5cf6;padding-left:12px;color:#555">${replyMessage.trim().replace(/\n/g, '<br>')}</blockquote>
              <p><a href="${process.env.PRODUCT_URL || ''}/dashboard/support">View in dashboard</a></p>
            `,
          });
        }
      } else if (!user.isAdmin && adminEmail) {
        // User replied → notify admin
        await sendResendEmail({
          to: adminEmail,
          subject: `[Rakuado Support] New reply on ticket: ${ticket.subject}`,
          html: `
            <h2>New reply on support ticket</h2>
            <p><strong>Ticket:</strong> ${ticket.subject}</p>
            <p><strong>Reply from:</strong> ${reply.authorName}</p>
            <blockquote style="border-left:4px solid #8b5cf6;padding-left:12px;color:#555">${replyMessage.trim().replace(/\n/g, '<br>')}</blockquote>
            <p><a href="${process.env.PRODUCT_URL || ''}/dashboard/support">View in dashboard</a></p>
          `,
        });
      }
    } else {
      // Status-only update
      await col.updateOne({ _id: new ObjectId(req.params.id) }, { $set: updates });
    }

    const updated = await col.findOne({ _id: new ObjectId(req.params.id) });
    res.json({ success: true, ticket: { ...updated, _id: updated._id.toString() } });
  } catch (err) {
    console.error('[support] update ticket error:', err);
    res.status(500).json({ success: false, error: 'Failed to update ticket' });
  }
});

module.exports = router;
