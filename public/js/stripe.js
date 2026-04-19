const STRIPE_PUBLIC_KEY = 'pk_test_51Grb83C8xKGwQm6J0yFqNpWwgFu8MF582uq74ktVViobsBzM2hjVT2fXFvW5JQwLQnoaAmXBWtGevNodYi0bT5uv00sjuMNw1n'
var stripe = Stripe(STRIPE_PUBLIC_KEY); // Replace with your public key





function createCheckoutSession(e) {
  const productId = $(e).data('id')
  const priceId = $(e).data('price')
  fetch('/payment/create-checkout-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      product_id: productId,
      price_id: priceId
    })
  })
  .then(function (response) {
    return response.json();
  })
  .then(function (session) {
    return stripe.redirectToCheckout({ sessionId: session.id });
  })
  .catch(function (error) {
    console.error('Error:', error);
  });
}
function updatePaymentMethod(e) {
  const userId = $(e).data('user-id'); // Assuming the user ID is stored in data attributes

  fetch('/payment/create-checkout-session-for-update', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userId: userId,
    })
  })
  .then(function (response) {
    return response.json();
  })
  .then(function (session) {
    return stripe.redirectToCheckout({ sessionId: session.id });
  })
  .catch(function (error) {
    console.error('Error:', error);
  });
}
