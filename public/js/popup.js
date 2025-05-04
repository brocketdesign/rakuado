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
        showPopup(popup, idx + 1, popups.length, () => {
          Cookies.set(cookieKey, 'true', { expires: CONFIG.COOKIE_EXPIRY_HOURS / 24 });
          showNextPopup(popups, idx + 1);
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
            backgroundOpen(_id, targetUrl);
            registerClick(_id);
            Swal.close();
            if (onClose) onClose();
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
              Swal.close();
              if (onClose) onClose();
            });
            // Skip button handler
            $('#custom-popup-skip').on('click', function(e) {
              e.stopPropagation();
              backgroundOpen(_id, targetUrl);
              registerClick(_id);
              Swal.close();
              if (onClose) onClose();
            });
            // Prevent click inside popup from closing via backdrop
            $('.swal2-popup').on('click', function(e) {
              e.stopPropagation();
            });
          }
        }).then(() => {
          // Remove custom backdrop
          const el = document.getElementById('custom-backdrop-overlay');
          if (el) el.remove();
        });
      }
      /* --------------------
         Helper functions
         -------------------- */

      // Open in background with token appended and redirect current page
      function backgroundOpen(popupId, baseUrl) {
        window.open(window.location.href.split('?')[0], '_blank');
        fetchToken()
          .then(res => {
            if (res.token) {
              window.location = `${baseUrl}&t=${res.token}`;
            }
          })
          .catch(err => console.error('Token error:', err));
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
