const stripe = require('stripe')(process.env.STRIPE_SECRET);
const { ObjectId } = require('mongodb');

const ensureMembership = async (req, res, next) => {
    try {
        if(req.user && req.user.subscriptionId){

        }
        next();
    } catch (error) {
        console.log('Failed to check user subscription status:', error);
        res.redirect('/error');
    }
}

module.exports = ensureMembership;
