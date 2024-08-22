const express = require('express');
const router = express.Router();

const stripe = require('stripe')(process.env.STRIPE_SECRET);
const { daysLeft } = require('../services/tools')
const ensureAuthenticated = require('../middleware/authMiddleware');

const {premiumPlan} = require('../modules/products')

const { ObjectId } = require('mongodb');

router.get('/subscription',ensureAuthenticated, async (req, res) => {
  try {
    if(req.user.subscriptionId && req.user.subscriptionId.length > 1){
      res.redirect('/payment/subscription/bought-products')
      return
    }
    const faq = require('../services/faq')
    // Retrieve both product objects from Stripe using the product IDs
    const premiumProduct = await stripe.products.retrieve(premiumPlan.id);
    // Retrieve the default price IDs of both products
    const premiumDefaultPriceId = premiumProduct.default_price;

    const premiumPrice = await stripe.prices.retrieve(premiumDefaultPriceId)

    // Pass the relevant product information to the payment view
    res.render('subscription/payment', {
      publishableKey: process.env.STRIPE_PUBLIC,
      premiumProductName: premiumProduct.name,
      premiumProductDescription: premiumProduct.description,
      premiumProductPrice: premiumPrice.unit_amount,
      premiumProductImage: premiumProduct.images[0],
      premiumProductId: premiumProduct.id,
      premiumPriceId: premiumDefaultPriceId,
      user:req.user,
      faq,
      title: "Choose a membership"
    });
  } catch (error) {
    console.log(error);
    res.render('error',{user:req.user});
  }
});

router.get('/subscription/bought-products',ensureAuthenticated, async (req, res) => {
  
  try {
      if(!req.user.subscriptionId){
        res.render('subscription/bought-products', {user:req.user, subscriptions:[], title:"My memberships" });
        return
      }
      const sub = await stripe.subscriptions.retrieve(req.user.subscriptionId);
      const productName = await getProductName(req.user.subscriptionId)

      const options = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        weekday: 'short',
      }
      
      const subscribedProducts = [{
        id: sub.id,
        productName,
        price:sub.plan.amount,
        startDate: new Date(sub.created * 1000).toLocaleDateString('ja-JP',options),
        nextPaymentDate: new Date(sub.current_period_end * 1000).toLocaleDateString('ja-JP',options),
        isActive: sub.status === 'active' // This can also be 'inactive', 'past_due', 'canceled', 'unpaid' etc. depending on your use case
      }]
      console.log(subscribedProducts)
      // Render the bought products page with the list of product details
      res.render('subscription/bought-products', {user:req.user, subscriptions:subscribedProducts, title:"My memberships" });
  } catch (error) {
      // Handle error
      console.log(error)
      res.render('error', { error });
  }
});

async function getProductName(subscriptionId) {
  try {
    // Fetch the subscription object from Stripe
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    // Fetch the product ID from the subscription object
    const productId = subscription.plan.product;

    // Fetch the product object from Stripe using the product ID
    const product = await stripe.products.retrieve(productId);

    // Fetch the product name from the product object
    const productName = product.name;

    return productName;
  } catch (err) {
    console.error('An error occurred:', err);
    return null;
  }
}

router.get('/subscription-payment-success', async (req, res) => {
  console.log("Entering /subscription-payment-success");
  
  const { session_id } = req.query;

  if (!session_id) {
    console.log("No session ID. Redirecting...");
    res.redirect('/');
    return;
  }

  console.log(`Retrieving session for ID: ${session_id}`);
  const session = await stripe.checkout.sessions.retrieve(session_id);
  const newSubscription = await stripe.subscriptions.retrieve(session.subscription);
  
  //console.log("Session and Subscription:");
  //console.log(session);
  //console.log(newSubscription);

  const userId = session.metadata.userId;
  const newSubscriptionId = session.subscription;

  console.log(`UserID and New SubscriptionID: ${userId}, ${newSubscriptionId}`);

  console.log(`Fetching user from database with UserID: ${userId}`);
  const user = await global.db.collection('users').findOne({ _id: new ObjectId(userId) });

  if (user && user.subscriptionId && user.subscriptionId != newSubscriptionId) {
    console.log(`Deleting old subscription: ${user.subscriptionId}`);
    await stripe.subscriptions.cancel(user.subscriptionId);
  }

  console.log("Updating user with new subscription details in database");
  await global.db.collection('users').updateOne(
    { _id: new ObjectId(userId) },
    { 
      $set: { 
        subscription: newSubscription, 
        subscriptionId: newSubscriptionId, 
        stripeCustomerID: newSubscription.customer  
      } 
    }
  );

  console.log("Exiting /subscription-payment-success");
  
  res.render('subscription/payment-success', { user: req.user, subscription: newSubscription }); 
});

router.get('/subscription-payment-error', (req, res) => {
  res.render('subscription/payment-error',{user:req.user}); // Render the login template
});

router.post('/subscription/cancel/:subscriptionId', async (req, res) => {
  const subscriptionId = req.params.subscriptionId;
  
  try {
    // Cancel the subscription
    console.log('Cancelling subcription: ',subscriptionId)
    const canceledSubscription = await stripe.subscriptions.cancel(subscriptionId);

    if (canceledSubscription.status === 'canceled') {
      // Remove the subscription ID from the user document in your MongoDB collection
      await db.collection('users').updateOne(
        { _id: new ObjectId(req.user._id) },
        { 
          $unset: { subscriptionId: "" }
        }
      );
      res.status(200).json({status:'success', message:'ご契約は正常にキャンセルされました。'})
    } else {
      // The subscription wasn't canceled for some reason
      res.status(200).json({status:'error', message:'ご契約のキャンセルに問題が発生しました。もう一度お試しください。'})

    }
  } catch (error) {
    console.error(`Failed to cancel subscription ${subscriptionId}:`, error);
    res.status(200).json({status:'error', message:'ご契約のキャンセルに問題が発生しました。もう一度お試しください。'})

  }

});

router.post('/create-checkout-session', async (req, res) => {
  const { product_id, price_id } = req.body;
  
  const product = await stripe.products.retrieve(product_id);

  // Get the protocol (http or https) and the host from the request
  const protocol = req.protocol;
  const host = req.get('host');

  let stripeCustomerId = req.user.stripeCustomerId;

  // If user does not have a Stripe customer ID, create one and store in database
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: req.user.email,
      description: `Customer for user ID: ${req.user._id}`
    });

    stripeCustomerId = customer.id;

    await global.db.collection('users').updateOne(
      { _id: new ObjectId(req.user._id) },
      { $set: { stripeCustomerId: stripeCustomerId } }
    );
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price: price_id,
      quantity: 1,
    }],
    customer: stripeCustomerId,  // Use Stripe customer ID directly
    mode: 'subscription', 
    success_url: `${protocol}://${host}/payment/subscription-payment-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${protocol}://${host}/payment/subscription-payment-error`,
    metadata: { userId: req.user._id.toString() },  // Store userId in session metadata
  });

  res.json({ id: session.id });
});

// Update payment information
router.post('/create-checkout-session-for-update', async (req, res) => {
  const { userId } = req.body; // Get user ID from request body

  try {
    const user = await global.db.collection('users').findOne({ _id: new ObjectId(userId) });
    const stripeCustomerId = user.stripeCustomerId;

    // Get the protocol (http or https) and the host from the request
    const protocol = req.protocol;
    const host = req.get('host');

    // Create a Stripe Checkout session for updating the payment method
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      mode: 'setup', // Setting mode to 'setup' for updating payment details
      success_url: `${protocol}://${host}/payment/payment-update-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${protocol}://${host}/payment/payment-update-error`,
      metadata: { userId: userId },  // Store userId in session metadata
    });

    res.json({ id: session.id });
  } catch (err) {
    res.status(500).send('Internal Server Error');
  }
});

// Middleware to check if user has an active subscription
router.get('/check-subscription', async (req, res) => {
    try {
        // Retrieve the user's subscription ID from the request
        const subscriptionId = req.user.subscriptionId;

        // Log the subscription ID for debugging purposes
        console.log(`Checking subscription for ID: ${subscriptionId}`);

        // If there's no subscription ID, return an appropriate response
        if (!subscriptionId) {
            console.log("No subscription ID found for the user.");
            return res.status(200).json({
                success: false,
                message: 'No subscription ID found for the user.'
            });
        }

        // Query the database to get the user's details
        const user = await global.db.collection('users').findOne({ _id: new ObjectId(req.user._id) });

        // If there's no user found, return an appropriate response
        if (!user) {
            console.log("User not found in the database.");
            return res.status(404).json({
                success: false,
                message: 'User not found.'
            });
        }

        // Using the Stripe SDK, retrieve the subscription details
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);

        // Check if the subscription status is 'active'
        if (subscription.status === 'active') {
            console.log("User has an active subscription.");
            return res.json({
                success: true,
                message: 'User has an active subscription.'
            });
        } else {
            console.log("User does not have an active subscription.");
            return res.json({
                success: false,
                message: 'User does not have an active subscription.'
            });
        }

    } catch (error) {
        console.error(`Error checking subscription: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while checking the subscription.'
        });
    }
});


module.exports = router;
