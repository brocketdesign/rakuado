/*
 * Referral popup widget
 * - Fetches enabled popups (with slug) from backend
 * - Renders Yahoo & Rakuten CTA layout inspired by cta-test-1.html using scoped styles
 * - Keeps analytics (view/click) reporting and backgroundOpen behaviour
 * - Persists per-slug cookies so refreshed pages only show remaining CTAs
 */
(function() {
  // Always update the file version when editing
  console.log('Referral popup widget version: v1.0.9');

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
        COOKIE_EXPIRY_HOURS: 1,
        COOKIE_PREFIX: 'referal-opened-',
        SCROLL_THRESHOLD_MIN: 20,
        SCROLL_THRESHOLD_MAX: 50,
        RENDER_DELAY_MS: 400
      };

      const BUTTON_PRESETS = {
        yahoo: {
          siteName: 'Yahoo!ショッピング',
          extraDays: 3,
          headline: 'Yahoo!ショッピングで50%オフクーポンをゲット！',
          accentHex: '#ef4444',
          logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/b/b5/Yahoo_Japan_Logo.svg'
        },
        rakuten: {
          siteName: '楽天市場',
          extraDays: 5,
          headline: '楽天市場で50%オフクーポンをゲット！',
          accentHex: '#d43c33',
          logoUrl: 'https://i1.wp.com/rakuten.today/wp-content/uploads/2018/06/one_logo.jpg?fit=2000%2C1350&ssl=1'
        }
      };

      const state = {
        root: null,
        shadow: null,
        wrapper: null,
        renderedSlugs: new Set(),
        pendingPopups: [],
        scrollGateAttached: false,
        scrollGateSatisfied: false,
        renderTimeoutId: null
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

      const resolvePresetKey = (slug) => {
        if (!slug) return null;
        if (BUTTON_PRESETS[slug]) return slug;
        const match = Object.keys(BUTTON_PRESETS).find(key => slug.startsWith(key));
        return match || null;
      };

      function fetchEnabledPopups() {
        fetch(`${CONFIG.REFERAL_API_URL}/enabled`)
          .then(res => res.json())
          .then(popups => {
            log('Enabled popups payload', popups);
            if (!Array.isArray(popups) || popups.length === 0) {
              return;
            }
            const enriched = popups
              .filter(Boolean)
              .map(p => {
                const slugSource = p.slug ? 'db' : 'fallback';
                const resolvedSlug = resolveSlug(p);
                const presetKey = resolvePresetKey(resolvedSlug);
                const snapshot = { ...p, slug: resolvedSlug, presetKey, slugSource };
                log('Enriched popup entry', snapshot);
                if (!p.slug) {
                  warn('Popup is missing slug in API payload', { popupId: p._id, slugSource });
                }
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
              log('All slugs already opened, nothing to render');
              teardown();
              return;
            }

              state.pendingPopups = filtered;
              log('Deferred rendering until scroll gate met', {
                count: filtered.length
              });
              armScrollGate();
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

      function ensureShadowRoot() {
        if (state.wrapper) return state;

        const host = document.createElement('div');
        host.id = 'referal-popup-host';
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
            gap: 16px;
            pointer-events: auto;
          }
          .cta-button {
            display: flex;
            align-items: center;
            background: #ffffff;
            border-radius: 9999px;
            padding: 16px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
            transition: transform 0.2s ease, box-shadow 0.2s ease;
            position: relative;
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
          }
          .cta-info h4 {
            font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
            font-weight: 700;
            font-size: 15px;
            color: #1f2937;
            margin: 0;
            line-height: 1.3;
          }
          .cta-info span {
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
          .pulse {
            animation: pulse 2s infinite;
          }
          @keyframes bounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-6px); }
          }
          @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 0.9; }
            50% { transform: scale(1.08); opacity: 1; }
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
              border-radius: 24px;
              padding: 16px;
              gap: 12px;
            }
            .cta-info {
              margin-right: 0;
            }
            .cta-actions {
              width: 100%;
              justify-content: space-between;
            }
          }
        `;

        shadow.appendChild(style);
        const wrapper = document.createElement('div');
        wrapper.className = 'popup-wrapper';
        shadow.appendChild(wrapper);

        state.root = host;
        state.shadow = shadow;
        state.wrapper = wrapper;

        return state;
      }

      function teardown() {
        if (state.root && state.root.parentNode) {
          log('Tearing down popup host');
          state.root.parentNode.removeChild(state.root);
        }
        state.root = null;
        state.shadow = null;
        state.wrapper = null;
        state.renderedSlugs.clear();
      }

      function renderButtons(popups) {
        const { wrapper } = ensureShadowRoot();
        wrapper.innerHTML = '';

        popups.forEach((popup, index) => {
          try {
            const element = createButtonElement(popup, index);
            if (element) {
              wrapper.appendChild(element);
              state.renderedSlugs.add(popup.slug);
              registerView(popup._id);
            }
          } catch (err) {
            error('Failed rendering popup', popup, err);
          }
        });

        if (!wrapper.children.length) {
          teardown();
        }
      }

      function renderPendingPopups() {
        if (!state.pendingPopups.length) {
          log('renderPendingPopups called with no pending items');
          return;
        }
        log('Rendering CTA buttons', state.pendingPopups.map(p => ({ popupId: p._id, slug: p.slug })));
        renderButtons(state.pendingPopups);
        state.pendingPopups = [];
        state.scrollGateSatisfied = true;
        state.renderTimeoutId = null;
        detachScrollGate();
      }

      function armScrollGate() {
        if (state.scrollGateAttached || state.scrollGateSatisfied) {
          log('Scroll gate already attached or satisfied', {
            attached: state.scrollGateAttached,
            satisfied: state.scrollGateSatisfied
          });
          evaluateScrollGate();
          return;
        }
        log('Attaching scroll gate listener');
        state.scrollGateAttached = true;
        window.addEventListener('scroll', evaluateScrollGate, { passive: true });
        evaluateScrollGate();
      }

      function detachScrollGate() {
        if (!state.scrollGateAttached) return;
        window.removeEventListener('scroll', evaluateScrollGate);
        state.scrollGateAttached = false;
        log('Scroll gate listener detached');
      }

      function evaluateScrollGate() {
        if (state.scrollGateSatisfied) return;
        if (!state.pendingPopups.length) return;
        const doc = document.documentElement;
        const scrollTop = window.pageYOffset || doc.scrollTop || document.body.scrollTop || 0;
        const viewportHeight = window.innerHeight || doc.clientHeight || 0;
        const scrollHeight = Math.max(doc.scrollHeight, document.body.scrollHeight);
        const seen = scrollTop + viewportHeight;
        const progress = scrollHeight <= 0
          ? 100
          : Math.min(100, Math.max(0, (seen / scrollHeight) * 100));
        log('Scroll progress check', { scrollTop, viewportHeight, scrollHeight, seen, progress });

        const withinRange = progress >= CONFIG.SCROLL_THRESHOLD_MIN && progress <= CONFIG.SCROLL_THRESHOLD_MAX;
        const beyondRange = progress > CONFIG.SCROLL_THRESHOLD_MAX;

        if (withinRange || beyondRange) {
          triggerPendingRender(progress, withinRange ? 'within-range' : 'beyond-range');
        }
      }

      function triggerPendingRender(progress, reason) {
        if (state.renderTimeoutId) {
          log('Render already scheduled, skipping trigger', { progress, reason });
          return;
        }
        state.scrollGateSatisfied = true;
        detachScrollGate();
        log('Scheduling CTA render after delay', {
          delay: CONFIG.RENDER_DELAY_MS,
          progress,
          reason
        });
        state.renderTimeoutId = window.setTimeout(() => {
          renderPendingPopups();
        }, CONFIG.RENDER_DELAY_MS);
      }

      function createButtonElement(popup, index) {
        const slug = popup.slug || `slot-${index}`;
        const presetKey = resolvePresetKey(slug);
        const preset = presetKey ? BUTTON_PRESETS[presetKey] : null;

        const siteName = popup.siteName
          || (preset ? preset.siteName : null)
          || slug;
        const extraDays = typeof popup.extraDays === 'number' ? popup.extraDays : (preset ? preset.extraDays : 3);
        const accentHex = popup.accentHex || (preset ? preset.accentHex : '#2563eb');
        const logoUrl = popup.logoUrl || (preset ? preset.logoUrl : popup.imageUrl || '');
        const headline = popup.headline
          || (preset ? preset.headline : `${siteName}で限定オファーをチェック！`);

        log('Creating CTA element', {
          popupId: popup._id,
          slug,
          presetKey,
          siteName,
          headline,
          logoUrl,
          extraDays,
          accentHex
        });

        const container = document.createElement('div');
        container.className = 'cta-button bounce';
        container.dataset.slug = slug;

        const expirationDate = buildExpirationDate(extraDays);
        const accent = accentHex;

        container.innerHTML = `
          <img class="logo" src="${logoUrl}" alt="${siteName} logo" />
          <div class="cta-info">
            <h4>${headline}</h4>
            <span>有効期限: ${expirationDate}（限定オファー）</span>
          </div>
          <div class="cta-actions">
            <button class="cta-primary pulse" type="button" style="background: linear-gradient(90deg, ${accent}, ${shadeColor(accent, -10)});">
              今すぐチェック
            </button>
            <button class="cta-close" type="button" aria-label="閉じる">×</button>
          </div>
        `;

        const primaryBtn = container.querySelector('.cta-primary');
        const closeBtn = container.querySelector('.cta-close');

        const handleAction = (event) => {
          event.preventDefault();
          event.stopPropagation();
          log('CTA interaction (click/close)', { slug, popupId: popup._id, targetUrl: popup.targetUrl });
          markOpened(slug);
          backgroundOpen(popup._id, popup.targetUrl, slug);
          container.remove();
          if (!state.wrapper.querySelector('.cta-button')) {
            teardown();
          }
        };

        primaryBtn.addEventListener('click', handleAction);
        closeBtn.addEventListener('click', handleAction);

        return container;
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
