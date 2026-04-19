const express = require('express');
const router = express.Router();
const ensureAuthenticated = require('../middleware/authMiddleware');
const stripe = require('stripe')(process.env.STRIPE_SECRET);
const { notifyAdmin } = require('../services/adminNotifications');

router.get('/checkout-cancel', ensureAuthenticated, (req, res) => {
    res.redirect('/dashboard?payment=false&message=支払いがキャンセルされました。');
});

// Advertiser budget deposit success callback
router.get('/advertiser-success', ensureAuthenticated, async (req, res) => {
  const { session_id } = req.query;
  if (!session_id) return res.redirect('/dashboard/advertiser/budget?error=missing_session');

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (session.payment_status !== 'paid') {
      return res.redirect('/dashboard/advertiser/budget?error=payment_not_complete');
    }
    if (session.metadata?.type !== 'advertiser_deposit') {
      return res.redirect('/dashboard/advertiser/budget?error=invalid_session');
    }

    // Idempotency: skip if this session was already processed
    const existing = await global.db
      .collection('adBudgetTransactions')
      .findOne({ stripeSessionId: session_id });
    if (!existing) {
      await global.db.collection('adBudgetTransactions').insertOne({
        advertiserId: session.metadata.advertiserId,
        type: 'deposit',
        amount: parseInt(session.metadata.amount, 10),
        stripeSessionId: session_id,
        createdAt: new Date(),
      });

      // Notify admin about the deposit
      try {
        const advertiser = await global.db
          .collection('advertisers')
          .findOne({ _id: require('mongodb').ObjectId.createFromHexString(session.metadata.advertiserId) });
        const userRecord = advertiser
          ? await global.db.collection('users').findOne({ _id: new (require('mongodb').ObjectId)(advertiser.userId) })
          : null;
        notifyAdmin('advertiser_deposit', {
          companyName: advertiser?.companyName || 'Unknown',
          email: userRecord?.email || '',
          amount: parseInt(session.metadata.amount, 10).toLocaleString('ja-JP'),
          stripeSessionId: session_id,
          depositedAt: new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }),
        });
      } catch (notifyErr) {
        console.error('Admin deposit notification error:', notifyErr.message);
      }
    }

    res.redirect('/dashboard/advertiser/budget?success=1');
  } catch (err) {
    console.error('GET /payment/advertiser-success', err);
    res.redirect('/dashboard/advertiser/budget?error=server_error');
  }
});

module.exports = router;