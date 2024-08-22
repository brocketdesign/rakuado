
module.exports = {
  premiumPlan : {
    id: process.env.STRIPE_PREMIUM_PLAN,
    price: process.env.STRIPE_PREMIUM_PLAN_PRICE,
    type: process.env.STRIPE_PREMIUM_PLAN_TYPE
  }
}