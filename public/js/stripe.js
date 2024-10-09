const STRIPE_PUBLIC_KEY = 'pk_test_51Grb83C8xKGwQm6J0yFqNpWwgFu8MF582uq74ktVViobsBzM2hjVT2fXFvW5JQwLQnoaAmXBWtGevNodYi0bT5uv00sjuMNw1n'
var stripe = Stripe(STRIPE_PUBLIC_KEY); // Replace with your public key



window.showCreditShop = function(el) {
  if (el && $(el).hasClass('open')) {
      return;
  }
  if (el && !$(el).hasClass('open')) {
      $(el).addClass('open');
  }
  Swal.fire({
      position: 'center',
      html: `
          <div class="col-12 my-3">
            <div class="card bg-light shadow-0 text-white">
                <div class="card-body p-2 d-flex flex-column">
                    <img src="/img/credits-custom.png" alt="Credit" class="mb-2 m-auto" style="width: 100px;">
                    <h6 class="text-dark fw-bold">カスタムクレジット</h6>
                    <p class="text-muted small mb-2" style="font-size:12px;">ご希望のクレジット数を入力してください</p>
                    <input type="number" id="custom-credits" class="form-control mb-2" min="500" placeholder="500">
                    <button id="credits-set-custom" class="buycredit btn custom-gradient-bg text-white w-100" data-credits="0">購入する</button>
                </div>
            </div>
        </div>
      `,
      showCancelButton: false,
      showConfirmButton: false,
      showCloseButton: true,
      allowOutsideClick: false,
      backdrop: false,
      customClass: {
          popup: 'swal2-card',
          content: 'p-0'
      },
      showClass: {
          popup: 'bg-light animate__animated animate__fadeInDown'
      },
      hideClass: {
          popup: 'bg-light animate__animated animate__fadeOutUp'
      },
      didOpen: () => {
          window.postMessage({ event: 'updateCredits' }, '*');
          $(document).on('click', '.buycredit', function() {
            let credits = $(this).data('credits');
            if (credits == 0) { // Custom amount
                credits = $('#custom-credits').val();
            }
            credits = parseInt(credits) || 0;

            if (credits < 500) {
                showNotification('最小購入クレジット数は500です。', 'error');
                return;
            }
            initiateCheckout(credits);
        });        
      },
      willClose: () => {
          if (el) {
              $(el).removeClass('open');
          }
      }
  });
};
$(document).on('click','.showCreditShopButton', function() {
  showCreditShop(this);
});
function initiateCheckout(credits) {
  $.ajax({
      url: '/payment/create-checkout-session',
      type: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({ credits: credits }),
      success: function(response) {
          const sessionId = response.sessionId;
          stripe.redirectToCheckout({ sessionId: sessionId });
      },
      error: function(xhr) {
          showNotification('チェックアウトの開始中にエラーが発生しました: ' + xhr.responseJSON.error, 'error');
      }
  });
}


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
