const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET);
const ensureAuthenticated = require('../middleware/authMiddleware');
const { ObjectId } = require('mongodb');

router.post('/create-checkout-session', ensureAuthenticated, async (req, res) => {
    const userId = req.user._id;
    const { credits } = req.body;
    if (credits < 500) return res.status(400).json({ error: 'Minimum purchase is 500 credits.' });
    const amountJPY = credits * 100;
    const protocol = req.protocol;
    const host = req.get('host');

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'jpy',
                    product_data: {
                        name: `${credits}クレジット`,
                    },
                    unit_amount: amountJPY,
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `${protocol}://${host}/payment/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${protocol}://${host}/payment/checkout-cancel`,
            metadata: { userId: userId.toString(), credits: credits.toString() },
        });
        res.json({ sessionId: session.id });
    } catch (error) {
        console.error('Error creating checkout session:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

router.get('/checkout-success', ensureAuthenticated, async (req, res) => {
    const sessionId = req.query.session_id;
    if (!sessionId) {
        res.redirect('/dashboard?payment=false&message=セッションIDが見つかりません。');
        return;
    }

    try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (session.payment_status === 'paid') {
            const userId = session.metadata.userId;
            const credits = parseFloat(session.metadata.credits);

            await global.db.collection('users').updateOne(
                { _id: new ObjectId(userId) },
                { $inc: { credits: credits } }
            );
            res.redirect('/dashboard?payment=success&message=支払いが成功しました！クレジットがアカウントに追加されました。');
        } else {
            res.redirect('/dashboard?payment=false&message=支払いステータスが不明です。');
        }
    } catch (error) {
        console.error('Error retrieving checkout session:', error);
        res.redirect(`/dashboard?payment=false&message=チェックアウトセッションの取得中にエラーが発生しました。`);
    }
});

router.get('/checkout-cancel', ensureAuthenticated, (req, res) => {
    res.redirect('/dashboard?payment=false&message=支払いがキャンセルされました。');
});

module.exports = router;