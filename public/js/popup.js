/*
 * Referral popup widget v1.2.0
 * - Fetches enabled Yahoo popups from backend
 * - Stage 1: Non-intrusive bottom popup (3s delay, 20s display time) - SEO friendly
 * - Stage 2: Full-screen overlay (5s skip timer) if Stage 1 not clicked - Intrusive fallback
 * - Persists per-slug cookies so refreshed pages skip shown popups
 * - Triggers backgroundOpen on user click/interaction
 */
(function() {
  console.log('Referral popup widget version: v1.2.0');

  const DEBUG_PREFIX = '[ReferalPopup]';

  const log = (...args) => console.log(DEBUG_PREFIX, ...args);
  const warn = (...args) => console.warn(DEBUG_PREFIX, ...args);
  const error = (...args) => console.error(DEBUG_PREFIX, ...args);

  let jQueryLoaded = typeof jQuery !== 'undefined';
  let cookiesLoaded = typeof Cookies !== 'undefined';

  log('Bootstrap starting', { jQueryLoaded, cookiesLoaded });

  // Fallback cookie helpers (will delegate to js-cookie if available)
  function getCookie(name) {
    if (typeof Cookies !== 'undefined') {
      return Cookies.get(name);
    }
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return undefined;
  }

  function setCookie(name, value, options = {}) {
    if (typeof Cookies !== 'undefined') {
      return Cookies.set(name, value, options);
    }
    let cookieString = `${name}=${value}`;
    if (options.expires) {
      const date = new Date();
      date.setTime(date.getTime() + (options.expires * 24 * 60 * 60 * 1000));
      cookieString += `; expires=${date.toUTCString()}`;
    }
    cookieString += `; path=${options.path || '/'}`;
    document.cookie = cookieString;
  }

  function ensureScript(src, onLoaded) {
    const tag = document.createElement('script');
    tag.src = src;
    tag.onload = onLoaded;
    tag.onerror = () => warn('Failed loading external script', src);
    document.head.appendChild(tag);
  }

  function checkAndInit() {
    if (jQueryLoaded && cookiesLoaded) {
      log('All dependencies ready, initializing');
      init();
    }
  }

  if (!jQueryLoaded) {
    log('Loading jQuery on demand');
    ensureScript('https://code.jquery.com/jquery-3.6.0.min.js', () => {
      jQueryLoaded = true;
      checkAndInit();
    });
  }

  if (!cookiesLoaded) {
    log('Loading js-cookie on demand');
    ensureScript('https://cdnjs.cloudflare.com/ajax/libs/js-cookie/3.0.5/js.cookie.min.js', () => {
      cookiesLoaded = true;
      checkAndInit();
    });
  }

  // If both libraries were already on page
  checkAndInit();

  function init() {
    (function($) {
      log('init() called');

      const CONFIG = {
        REFERAL_API_URL: 'https://rakuado-43706e27163e.herokuapp.com/api/referal',
        COOKIE_EXPIRY_HOURS: 24,
        COOKIE_PREFIX: 'referal-opened-',
        STAGE1_DELAY_MS: 3000,      // Stage 1 appears after 3s page load
        STAGE1_DISPLAY_MS: 20000,   // Stage 1 visible for 20s
        STAGE2_SKIP_MS: 5000        // Stage 2 skip button becomes clickable after 5s
      };

      const YAHOO_PRESET = {
        siteName: 'Yahoo!ショッピング',
        extraDays: 3,
        headline: 'Yahoo!ショッピングで50%オフクーポンをゲット！',
        accentHex: '#ef4444',
        logoUrl: 'https://hatoltd.com/affiliate-partner/yahoo-logo.png'
      };

      const state = {
        currentPopup: null,
        stage1Root: null,
        stage1Shadow: null,
        stage1TimeoutId: null,
        stage1DismissTimeoutId: null,
        stage1CountdownInterval: null,
        stage2Root: null,
        stage2Shadow: null,
        stage2SkipTimeoutId: null,
        stage2SkipCounter: null,
        interacted: false,
        processingInteraction: false  // Lock to prevent concurrent interactions
      };

      $(document).ready(() => {
        log('Document ready, fetching enabled popups');
        fetchEnabledPopups();
      });

      const normalizeSlug = (slugRaw = '') => {
        if (typeof slugRaw !== 'string') return '';
        const sanitized = slugRaw
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, '-')
          .replace(/-{2,}/g, '-')
          .replace(/^-|-$/g, '');
        return sanitized || slugRaw.trim();
      };

      const resolveSlug = (popup) => {
        const direct = normalizeSlug(popup.slug);
        if (direct) {
          log('Resolved slug from popup.slug', { popupId: popup._id, raw: popup.slug, normalized: direct });
          return direct;
        }
        const fallback = `popup-${popup._id}`;
        log('Resolved slug via fallback', { popupId: popup._id, fallback });
        return fallback;
      };

      function fetchEnabledPopups() {
        fetch(`${CONFIG.REFERAL_API_URL}/enabled`)
          .then(res => res.json())
          .then(popups => {
            log('Enabled popups payload', popups);
            if (!Array.isArray(popups) || popups.length === 0) {
              log('No enabled popups available');
              return;
            }

            // Only use Yahoo popups
            const yahooPopups = popups.filter(p => {
              const slug = normalizeSlug(p.slug);
              return slug && slug.includes('yahoo');
            });

            if (yahooPopups.length === 0) {
              log('No Yahoo popups available');
              return;
            }

            const enriched = yahooPopups
              .filter(Boolean)
              .map(p => {
                const resolvedSlug = resolveSlug(p);
                const snapshot = { ...p, slug: resolvedSlug };
                log('Enriched popup entry', snapshot);
                return snapshot;
              });

            const filtered = enriched.filter(p => {
              const alreadyOpened = hasOpened(p.slug);
              log('Filter check', { popupId: p._id, slug: p.slug, alreadyOpened });
              return !alreadyOpened;
            });

            log('Filtered popups summary', {
              total: enriched.length,
              eligible: filtered.length,
              filteredIds: filtered.map(p => p._id)
            });

            if (filtered.length === 0) {
              log('All Yahoo popups already opened');
              return;
            }

            // Use first eligible popup
            const popup = filtered[0];
            log('Selected popup for display', { popupId: popup._id, slug: popup.slug });

            // Schedule Stage 1 display
            scheduleStage1(popup);
          })
          .catch(err => error('Failed to fetch enabled popups', err));
      }

      function hasOpened(slug) {
        const cookieKey = CONFIG.COOKIE_PREFIX + slug;
        const rawValue = getCookie(cookieKey);
        const opened = Boolean(rawValue);
        log('Checking cookie status', { slug, cookieKey, rawValue, opened });
        return opened;
      }

      function markOpened(slug) {
        const cookieKey = CONFIG.COOKIE_PREFIX + slug;
        log('Persisting opened slug', { slug, cookieKey });
        setCookie(cookieKey, 'true', { expires: CONFIG.COOKIE_EXPIRY_HOURS / 24, path: '/' });
      }

      function scheduleStage1(popup) {
        state.currentPopup = popup;
        registerView(popup._id);

        log('Scheduling Stage 1 display', {
          delay: CONFIG.STAGE1_DELAY_MS,
          popupId: popup._id
        });

        state.stage1TimeoutId = window.setTimeout(() => {
          log('Displaying Stage 1 popup', { popupId: popup._id });
          renderStage1(popup);

          // Schedule Stage 1 auto-dismiss
          state.stage1DismissTimeoutId = window.setTimeout(() => {
            log('Stage 1 timeout - dismissing and showing Stage 2', { popupId: popup._id });
            dismissStage1();
            scheduleStage2(popup);
          }, CONFIG.STAGE1_DISPLAY_MS);
        }, CONFIG.STAGE1_DELAY_MS);
      }

      function renderStage1(popup) {
        const host = document.createElement('div');
        host.id = 'referal-popup-stage1-host';
        host.style.position = 'fixed';
        host.style.left = '20px';
        host.style.bottom = '20px';
        host.style.zIndex = '2147483647';
        host.style.width = 'auto';
        host.style.pointerEvents = 'none';
        document.body.appendChild(host);

        const shadow = host.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = `
          :host {
            all: initial;
          }
          *, *::before, *::after {
            box-sizing: border-box;
          }
          .popup-wrapper {
            display: flex;
            flex-direction: column;
            gap: 0;
            pointer-events: auto;
          }
          .progress-bar {
            width: 100%;
            height: 3px;
            background: #e5e7eb;
            border-radius: 9999px 9999px 0 0;
            overflow: hidden;
          }
          .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #ef4444, #dc2626);
            width: 100%;
            animation: depleteBar 20s linear forwards;
          }
          @keyframes depleteBar {
            from { width: 100%; }
            to { width: 0%; }
          }
          .cta-button {
            display: flex;
            align-items: center;
            background: #ffffff;
            border-radius: 0 0 9999px 9999px;
            padding: 16px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
            transition: transform 0.2s ease, box-shadow 0.2s ease;
            position: relative;
            cursor: pointer;
          }
          .cta-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 30px 60px -15px rgba(0, 0, 0, 0.35);
          }
          .cta-button .logo {
            width: 36px;
            height: 36px;
            border-radius: 9999px;
            object-fit: contain;
            margin-right: 16px;
            flex-shrink: 0;
            background: #fff;
          }
          .cta-info {
            display: flex;
            flex-direction: column;
            margin-right: 16px;
            min-width: 0;
            flex: 1;
          }
          .cta-info h4 {
            font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
            font-weight: 700;
            font-size: 15px;
            color: #1f2937;
            margin: 0;
            line-height: 1.3;
          }
          .cta-info .countdown {
            font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
            font-weight: 600;
            font-size: 12px;
            color: #ef4444;
            margin-top: 4px;
            white-space: nowrap;
          }
          .cta-actions {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-left: auto;
            flex-shrink: 0;
          }
          .cta-primary {
            font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
            font-weight: 600;
            font-size: 14px;
            color: #ffffff;
            padding: 10px 18px;
            border-radius: 9999px;
            cursor: pointer;
            border: none;
            transition: transform 0.15s ease, box-shadow 0.2s ease;
          }
          .cta-primary:hover {
            transform: scale(1.05);
            box-shadow: 0 10px 20px rgba(239, 68, 68, 0.25);
          }
          .cta-close {
            width: 28px;
            height: 28px;
            border-radius: 9999px;
            border: 1px solid rgba(148, 163, 184, 0.4);
            background: rgba(248, 250, 252, 0.95);
            color: #475569;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: background 0.2s ease, color 0.2s ease;
          }
          .cta-close:hover {
            background: rgba(226, 232, 240, 0.95);
            color: #1f2937;
          }
          .bounce {
            animation: bounce 1.5s infinite;
          }
          @keyframes bounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-6px); }
          }
          @media (max-width: 640px) {
            :host {
              left: 12px !important;
              right: 12px !important;
            }
            .popup-wrapper {
              width: calc(100vw - 24px);
            }
            .cta-button {
              flex-direction: column;
              align-items: flex-start;
              border-radius: 0 0 24px 24px;
              padding: 16px;
            }
            .cta-info {
              margin-right: 0;
              margin-bottom: 12px;
            }
            .cta-actions {
              width: 100%;
              justify-content: space-between;
              margin-left: 0;
            }
          }
        `;

        shadow.appendChild(style);
        const wrapper = document.createElement('div');
        wrapper.className = 'popup-wrapper';
        shadow.appendChild(wrapper);

        // Progress bar
        const progressContainer = document.createElement('div');
        progressContainer.className = 'progress-bar';
        const progressFill = document.createElement('div');
        progressFill.className = 'progress-fill';
        progressContainer.appendChild(progressFill);
        wrapper.appendChild(progressContainer);

        const expirationDate = buildExpirationDate(YAHOO_PRESET.extraDays);
        const accent = YAHOO_PRESET.accentHex;

        const container = document.createElement('div');
        container.className = 'cta-button bounce';
        container.dataset.slug = popup.slug;

        container.innerHTML = `
          <img class="logo" src="${YAHOO_PRESET.logoUrl}" alt="Yahoo!ショッピング logo" />
          <div class="cta-info">
            <h4>${YAHOO_PRESET.headline}</h4>
            <div class="countdown">有効期限: ${expirationDate}（残り <span id="timer">20</span>秒）</div>
          </div>
          <div class="cta-actions">
            <button class="cta-primary" type="button" style="background: linear-gradient(90deg, ${accent}, ${shadeColor(accent, -10)});">
              今すぐチェック
            </button>
            <button class="cta-close" type="button" aria-label="閉じる">×</button>
          </div>
        `;

        const primaryBtn = container.querySelector('.cta-primary');
        const closeBtn = container.querySelector('.cta-close');
        const timerDisplay = container.querySelector('#timer');

        // Countdown timer
        let remainingTime = 20;
        state.stage1CountdownInterval = window.setInterval(() => {
          remainingTime--;
          if (timerDisplay) {
            timerDisplay.textContent = remainingTime;
          }
          if (remainingTime <= 0) {
            if (state.stage1CountdownInterval) {
              window.clearInterval(state.stage1CountdownInterval);
            }
          }
        }, 1000);

        const handleAction = (event) => {
          // Prevent concurrent interactions
          if (state.processingInteraction) {
            log('Interaction already in progress, ignoring duplicate');
            return;
          }
          state.processingInteraction = true;

          event.preventDefault();
          event.stopPropagation();
          log('Stage 1: User interaction', { popupId: popup._id });
          state.interacted = true;
          markOpened(popup.slug);
          dismissStage1();
          dismissStage2();
          backgroundOpen(popup._id, popup.targetUrl, popup.slug);
        };

        primaryBtn.addEventListener('click', handleAction);
        closeBtn.addEventListener('click', handleAction);
        container.addEventListener('click', handleAction);

        wrapper.appendChild(container);
        state.stage1Root = host;
        state.stage1Shadow = shadow;
      }

      function dismissStage1() {
        if (state.stage1CountdownInterval) {
          window.clearInterval(state.stage1CountdownInterval);
          state.stage1CountdownInterval = null;
        }
        if (state.stage1DismissTimeoutId) {
          window.clearTimeout(state.stage1DismissTimeoutId);
          state.stage1DismissTimeoutId = null;
        }
        if (state.stage1Root && state.stage1Root.parentNode) {
          log('Dismissing Stage 1 popup');
          state.stage1Root.parentNode.removeChild(state.stage1Root);
        }
        state.stage1Root = null;
        state.stage1Shadow = null;
      }

      function scheduleStage2(popup) {
        if (state.interacted) {
          log('User already interacted, skipping Stage 2');
          return;
        }

        log('Scheduling Stage 2 display', { popupId: popup._id });
        renderStage2(popup);
      }

      function renderStage2(popup) {
        // Create overlay container
        const overlay = document.createElement('div');
        overlay.id = 'referal-popup-stage2-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        overlay.style.zIndex = '2147483646';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.pointerEvents = 'auto';

        document.body.appendChild(overlay);

        const host = document.createElement('div');
        host.id = 'referal-popup-stage2-host';
        host.style.position = 'relative';
        host.style.zIndex = '2147483647';
        host.style.width = 'auto';
        host.style.maxWidth = '90vw';
        host.style.pointerEvents = 'auto';
        overlay.appendChild(host);

        const shadow = host.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = `
          :host {
            all: initial;
          }
          *, *::before, *::after {
            box-sizing: border-box;
          }
          .modal-container {
            background: #ffffff;
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 50px 100px -20px rgba(0, 0, 0, 0.3);
            text-align: center;
            position: relative;
          }
          .modal-container .logo {
            width: 60px;
            height: 60px;
            margin: 0 auto 20px;
            object-fit: contain;
          }
          .modal-container h2 {
            font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
            font-weight: 700;
            font-size: 24px;
            color: #1f2937;
            margin: 0 0 10px 0;
            line-height: 1.3;
          }
          .modal-container p {
            font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
            font-weight: 500;
            font-size: 16px;
            color: #6b7280;
            margin: 0 0 30px 0;
            line-height: 1.5;
          }
          .modal-actions {
            display: flex;
            gap: 12px;
            justify-content: center;
            flex-wrap: wrap;
          }
          .modal-skip {
            font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
            font-weight: 500;
            font-size: 14px;
            color: #9ca3af;
            padding: 10px 20px;
            border-radius: 9999px;
            border: 1px solid #e5e7eb;
            background: #f9fafb;
            cursor: pointer;
            transition: all 0.2s ease;
          }
          .modal-skip:hover:not(:disabled) {
            background: #f3f4f6;
            color: #6b7280;
          }
          .modal-skip:disabled {
            opacity: 0.7;
            cursor: not-allowed;
          }
          .modal-primary {
            font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
            font-weight: 600;
            font-size: 16px;
            color: #ffffff;
            padding: 12px 30px;
            border-radius: 9999px;
            border: none;
            cursor: pointer;
            transition: all 0.2s ease;
          }
          .modal-primary:hover {
            transform: scale(1.05);
            box-shadow: 0 10px 20px rgba(239, 68, 68, 0.25);
          }
          .skip-countdown {
            font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
            font-size: 12px;
            color: #9ca3af;
            margin-top: 8px;
          }
          @media (max-width: 640px) {
            .modal-container {
              padding: 24px;
              border-radius: 16px;
            }
            .modal-container h2 {
              font-size: 20px;
            }
            .modal-container p {
              font-size: 14px;
            }
            .modal-actions {
              flex-direction: column;
            }
          }
        `;

        shadow.appendChild(style);
        const wrapper = document.createElement('div');
        wrapper.className = 'modal-container';
        shadow.appendChild(wrapper);

        const expirationDate = buildExpirationDate(YAHOO_PRESET.extraDays);
        const accent = YAHOO_PRESET.accentHex;

        wrapper.innerHTML = `
          <img class="logo" src="${YAHOO_PRESET.logoUrl}" alt="Yahoo!ショッピング logo" />
          <h2>${YAHOO_PRESET.headline}</h2>
          <p>有効期限: ${expirationDate}（限定オファー）</p>
          <div class="modal-actions">
            <button class="modal-skip" type="button" id="skip-btn" disabled>スキップ (5秒)</button>
            <button class="modal-primary" type="button" id="cta-btn" style="background: linear-gradient(90deg, ${accent}, ${shadeColor(accent, -10)});">
              今すぐチェック
            </button>
          </div>
          <div class="skip-countdown" id="countdown"></div>
        `;

        state.stage2Root = overlay;
        state.stage2Shadow = shadow;

        const skipBtn = wrapper.querySelector('#skip-btn');
        const ctaBtn = wrapper.querySelector('#cta-btn');
        const countdown = wrapper.querySelector('#countdown');

        let skipCountdown = 5;
        state.stage2SkipCounter = skipCountdown;

        const updateCountdown = () => {
          skipCountdown--;
          state.stage2SkipCounter = skipCountdown;
          if (skipCountdown <= 0) {
            skipBtn.disabled = false;
            skipBtn.textContent = 'スキップ';
            countdown.textContent = '';
            if (state.stage2SkipTimeoutId) {
              window.clearTimeout(state.stage2SkipTimeoutId);
            }
          } else {
            countdown.textContent = `スキップできるまであと${skipCountdown}秒`;
            state.stage2SkipTimeoutId = window.setTimeout(updateCountdown, 1000);
          }
        };

        countdown.textContent = `スキップできるまであと${skipCountdown}秒`;
        state.stage2SkipTimeoutId = window.setTimeout(updateCountdown, 1000);

        const handleClose = () => {
          // Prevent concurrent interactions
          if (state.processingInteraction) {
            log('Interaction already in progress, ignoring duplicate');
            return;
          }
          state.processingInteraction = true;

          log('Stage 2: User clicked skip - triggering backgroundOpen');
          state.interacted = true;
          markOpened(popup.slug);
          dismissStage2();
          backgroundOpen(popup._id, popup.targetUrl, popup.slug);
        };

        const handleCTA = (event) => {
          // Prevent concurrent interactions
          if (state.processingInteraction) {
            log('Interaction already in progress, ignoring duplicate');
            return;
          }
          state.processingInteraction = true;

          event.preventDefault();
          event.stopPropagation();
          log('Stage 2: User clicked CTA', { popupId: popup._id });
          state.interacted = true;
          markOpened(popup.slug);
          dismissStage2();
          backgroundOpen(popup._id, popup.targetUrl, popup.slug);
        };

        // Clicking anywhere on the overlay (except the modal) or buttons triggers the CTA
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) {
            handleCTA(e);
          }
        });

        skipBtn.addEventListener('click', handleClose);
        ctaBtn.addEventListener('click', handleCTA);
      }

      function dismissStage2() {
        if (state.stage2SkipTimeoutId) {
          window.clearTimeout(state.stage2SkipTimeoutId);
          state.stage2SkipTimeoutId = null;
        }
        if (state.stage2Root && state.stage2Root.parentNode) {
          log('Dismissing Stage 2 popup');
          state.stage2Root.parentNode.removeChild(state.stage2Root);
        }
        state.stage2Root = null;
        state.stage2Shadow = null;
        state.stage2SkipCounter = null;
      }

      function buildExpirationDate(extraDays) {
        const baseDate = new Date();
        const days = Number(extraDays) || 0;
        const expiration = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
        return expiration.toISOString().slice(0, 10);
      }

      function shadeColor(color, percent) {
        // Simple hex shade helper for CTA gradient
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const r = (num >> 16) + amt;
        const g = ((num >> 8) & 0x00FF) + amt;
        const b = (num & 0x0000FF) + amt;
        return `#${(
          0x1000000 +
          (r < 255 ? (r < 0 ? 0 : r) : 255) * 0x10000 +
          (g < 255 ? (g < 0 ? 0 : g) : 255) * 0x100 +
          (b < 255 ? (b < 0 ? 0 : b) : 255)
        ).toString(16).slice(1)}`;
      }

      /* --------------------
         Analytics helpers
         -------------------- */

      function backgroundOpen(popupId, baseUrl, slug) {
        if (!baseUrl) {
          warn('Missing targetUrl for popup', { popupId, slug });
          return;
        }

        try {
          log('backgroundOpen triggered', { popupId, slug, baseUrl });
          window.open(window.location.href.split('?')[0], '_blank');
        } catch (err) {
          warn('Unable to open background tab', err);
        }

        registerClick(popupId);

        fetchToken()
          .then(res => {
            log('Token response', res);
            if (res && res.token) {
              window.location = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}t=${res.token}`;
            } else {
              window.location = baseUrl;
            }
          })
          .catch(err => {
            warn('Token fetch failed, redirecting without token', err);
            window.location = baseUrl;
          });
      }

      function fetchToken() {
        return $.post('https://yuuyasumi.com/wp-json/myapi/v1/get-token',
          { secret: 'KnixnLd3' }, 'json');
      }

      function registerView(popupId) {
        const domain = window.location.hostname;
        log('Registering view', { popupId, domain });
        fetch(`${CONFIG.REFERAL_API_URL}/register-view?popup=${popupId}&domain=${encodeURIComponent(domain)}`)
          .catch(err => warn('Failed to register view', err));
      }

      function registerClick(popupId) {
        const domain = window.location.hostname;
        log('Registering click', { popupId, domain });
        fetch(`${CONFIG.REFERAL_API_URL}/register-click?popup=${popupId}&domain=${encodeURIComponent(domain)}`)
          .catch(err => warn('Failed to register click', err));
      }
    })(jQuery);
  }
})();
