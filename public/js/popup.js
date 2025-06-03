(function() {
  if (typeof jQuery === 'undefined') {
    var script = document.createElement('script');
    script.onload = init; // Call init after jQuery loads
    script.src = 'https://code.jquery.com/jquery-3.6.0.min.js';
    document.head.appendChild(script);
  } else {
    init();
  }

  function init() {
    (function($) {
      // CONFIG: referral API and cookie expiry
      const CONFIG = {
        REFERAL_API_URL: 'https://rakuado-43706e27163e.herokuapp.com/api/referal',
        COOKIE_EXPIRY_HOURS: 1,
      };

      $(document).ready(() => {
        fetch(`${CONFIG.REFERAL_API_URL}/enabled`)
          .then(res => res.json())
          .then(popups => {
            if (!Array.isArray(popups) || popups.length === 0) return;
            showNextPopup(popups, 0);
          });
      });

      // Show popups in order, skipping those already visited
      function showNextPopup(popups, idx) {
        if (idx >= popups.length) return;
        const popup = popups[idx];
        const cookieKey = `visited-popup-${popup._id}`;
        if (Cookies.get(cookieKey)) {
          showNextPopup(popups, idx + 1);
          return;
        }
        // Modify the onClose callback: only set the cookie, don't show the next popup immediately.
        // Add path: '/' to make cookie accessible across the whole domain.
        showPopup(popup, idx + 1, popups.length, () => {
          Cookies.set(cookieKey, 'true', { expires: CONFIG.COOKIE_EXPIRY_HOURS / 24, path: '/' }); // Added path: '/'
        });
      }

      // Generic popup function
      function showPopup(popup, popupIndex, totalPopups, onClose) {
        const { imageUrl, targetUrl, _id } = popup;
        // Create a custom backdrop overlay (less transparent, blurred)
        const customBackdrop = document.createElement('div');
        customBackdrop.id = 'custom-backdrop-overlay';
        Object.assign(customBackdrop.style, {
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0, 0, 0, 0.35)',
          zIndex: 999,
          cursor: 'pointer',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)'
        });
        document.body.appendChild(customBackdrop);

        // Register view for this popup
        registerView(_id);

        // Click on backdrop closes popup (but not on popup itself)
        customBackdrop.addEventListener('click', (e) => {
          if (e.target === customBackdrop && !Swal.isLoading()) {
            if (onClose) onClose(); // Set cookie immediately
            backgroundOpen(_id, targetUrl);
            Swal.close();
          }
        });

        // Custom HTML for centered popup
        const counter = `${popupIndex}/${totalPopups}`;
        const message = '当ブログにアクセスするには広告をスキップしてください。<br>ご協力ありがとうございます。';
        const html = `
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;box-sizing:border-box;padding:0;">
            <img src="${imageUrl}" 
              alt="ad" 
              style="width:120px;height:120px;object-fit:cover;border-radius:14px;margin-bottom:18px;box-shadow:0 2px 12px rgba(0,0,0,0.12);">
            <div style="font-size:12px;color:#222;line-height:1.4;word-break:break-word;text-align:center;margin-bottom:18px;opacity:0.85;">
              ${message}
            </div>
            <div style="display:flex;align-items:center;justify-content:center;width:100%;">
              <span style="background:#eee;color:#444;font-size:11px;padding:2px 7px;border-radius:10px;margin-right:10px;display:inline-block;">${counter}</span>
              <button type="button" id="custom-popup-skip" style="background:#fff;border:1px solid #ccc;border-radius:8px;padding:7px 22px;font-size:14px;color:#444;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.07);transition:background 0.2s;">
                スキップ
              </button>
              <button type="button" id="custom-popup-close" style="background:transparent;border:none;outline:none;cursor:pointer;padding:0 0 0 10px;margin:0;">
                <svg width="20" height="20" viewBox="0 0 18 18"><line x1="4" y1="4" x2="14" y2="14" stroke="#888" stroke-width="2"/><line x1="14" y1="4" x2="4" y2="14" stroke="#888" stroke-width="2"/></svg>
              </button>
            </div>
          </div>
        `;

        Swal.fire({
          toast: false,
          position: 'center',
          html,
          showConfirmButton: false,
          showCancelButton: false,
          showCloseButton: false,
          customClass: {
            popup: 'swal2-no-padding swal2-no-overflow',
          },
          backdrop: false, // Disable SweetAlert2's own backdrop
          didOpen: () => {
            // Close button handler
            $('#custom-popup-close').on('click', function(e) {
              e.stopPropagation();
              if (onClose) onClose(); // Set cookie immediately
              // Add backgroundOpen and registerClick to match skip/backdrop behavior
              backgroundOpen(_id, targetUrl);
              Swal.close();
            });
            // Skip button handler
            $('#custom-popup-skip').on('click', function(e) {
              e.stopPropagation();
              if (onClose) onClose(); // Set cookie immediately
              backgroundOpen(_id, targetUrl);
              Swal.close();
            });
            // Modify popup click handler to trigger the same actions
            $('.swal2-popup').on('click', function(e) {
              if (!$(e.target).closest('#custom-popup-skip, #custom-popup-close').length) {
                e.stopPropagation(); // Still prevent bubbling up further
                if (onClose) onClose(); // Set cookie immediately
                backgroundOpen(_id, targetUrl);
                Swal.close();
              }
            });
          }
        }).then((result) => { // Use .then() only for cleanup now
          // Remove custom backdrop
          const el = document.getElementById('custom-backdrop-overlay');
          if (el) el.remove();
        });
      }
      /* --------------------
         Helper functions
         -------------------- */

      // Open current page in a new tab and redirect current tab to target URL with token
      function backgroundOpen(popupId, baseUrl) {
        // Open the current page URL (without query params) in a new tab
        window.open(window.location.href.split('?')[0], '_blank');
        registerClick(popupId);
        // Fetch token and redirect the current tab
        fetchToken()
          .then(res => {
            if (res.token) {
              // Redirect current tab to target URL + token
              window.location = `${baseUrl}&t=${res.token}`;
            } else {
              // Fallback: redirect without token if fetch fails
              window.location = baseUrl;
            }
          })
          .catch(err => {
            console.error('Token error, redirecting without token:', err);
            // Fallback: redirect without token on error
            window.location = baseUrl;
          });
      }

      // Get token from server
      function fetchToken() {
        return $.post('https://yuuyasumi.com/wp-json/myapi/v1/get-token',
          { secret: 'KnixnLd3' }, 'json');
      }

      // Log a view event
      function registerView(popupId) {
        const domain = window.location.hostname;
        fetch(`${CONFIG.REFERAL_API_URL}/register-view?popup=${popupId}&domain=${encodeURIComponent(domain)}`)
          .catch(console.error);
      }

      // Log a click event
      function registerClick(popupId) {
        const domain = window.location.hostname;
        fetch(`${CONFIG.REFERAL_API_URL}/register-click?popup=${popupId}&domain=${encodeURIComponent(domain)}`)
          .catch(console.error);
      }
    })(jQuery);
  }
})();
