const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

// Handler function for serving the partner ad widget script
async function servePartnerAdScript(req, res) {
  try {
    // Get partner ID from query parameter (set by the snippet)
    const partnerId = req.query.partnerId;
    
    if (!partnerId) {
      res.setHeader('Content-Type', 'application/javascript');
      return res.status(400).send('// Partner ID is required');
    }

    // Validate partner exists and is active
    let partner;
    try {
      partner = await global.db.collection('partnerRequests').findOne({ 
        _id: new ObjectId(partnerId),
        status: { $in: ['approved', 'snippet_sent', 'snippet_verified'] }
      });
    } catch (error) {
      res.setHeader('Content-Type', 'application/javascript');
      return res.status(400).send('// Invalid partner ID');
    }

    if (!partner) {
      res.setHeader('Content-Type', 'application/javascript');
      return res.status(404).send('// Partner not found or not approved');
    }

    // Set content type to JavaScript with charset
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    
    // Get the app domain from environment or use default
    const appDomain = process.env.PRODUCT_URL || 'https://app.rakuado.net';
    
    // Generate the widget script
    const widgetScript = `
/*
 * RakuAdo Partner Ad Widget v2.0.0
 * - Fetches enabled popups from backend
 * - Shows a centered overlay popup after a short delay
 * - Any click (CTA, close button, or overlay backdrop) triggers backgroundOpen
 * - Persists per-slug cookies so refreshed pages skip already-shown popups
 */
(function() {
  console.log('RakuAdo Partner Ad Widget version: v2.0.0');

  const DEBUG_PREFIX = '[RakuAdoPartnerAd]';
  const PARTNER_ID = '${partnerId}';
  const API_BASE_URL = '${appDomain}/api';

  const log = (...args) => console.log(DEBUG_PREFIX, ...args);
  const warn = (...args) => console.warn(DEBUG_PREFIX, ...args);
  const error = (...args) => console.error(DEBUG_PREFIX, ...args);

  let jQueryLoaded = typeof jQuery !== 'undefined';
  let cookiesLoaded = typeof Cookies !== 'undefined';

  log('Bootstrap starting', { jQueryLoaded, cookiesLoaded, partnerId: PARTNER_ID });

  // Fallback cookie helpers (will delegate to js-cookie if available)
  function getCookie(name) {
    if (typeof Cookies !== 'undefined') {
      return Cookies.get(name);
    }
    const value = \`; \${document.cookie}\`;
    const parts = value.split(\`; \${name}=\`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return undefined;
  }

  function setCookie(name, value, options = {}) {
    if (typeof Cookies !== 'undefined') {
      return Cookies.set(name, value, options);
    }
    let cookieString = \`\${name}=\${value}\`;
    if (options.expires) {
      const date = new Date();
      date.setTime(date.getTime() + (options.expires * 24 * 60 * 60 * 1000));
      cookieString += \`; expires=\${date.toUTCString()}\`;
    }
    cookieString += \`; path=\${options.path || '/'}\`;
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
        PARTNER_API_URL: \`\${API_BASE_URL}/partner-ad\`,
        COOKIE_EXPIRY_HOURS: 24,
        COOKIE_PREFIX: 'rakuado-partner-opened-',
        POPUP_DELAY_MS: 3000
      };

      const state = {
        currentPopup: null,
        popupRoot: null,
        popupTimeoutId: null,
        processingInteraction: false
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
        const fallback = \`popup-\${popup._id}\`;
        log('Resolved slug via fallback', { popupId: popup._id, fallback });
        return fallback;
      };

      function fetchEnabledPopups() {
        fetch(\`\${CONFIG.PARTNER_API_URL}/enabled?partnerId=\${PARTNER_ID}\`)
          .then(res => res.json())
          .then(popups => {
            log('Enabled popups payload', popups);
            if (!Array.isArray(popups) || popups.length === 0) {
              log('No enabled popups available');
              return;
            }

            const enriched = popups
              .filter(Boolean)
              .map(p => {
                const resolvedSlug = resolveSlug(p);
                const snapshot = { ...p, slug: resolvedSlug };
                log('Enriched popup entry', snapshot);
                return snapshot;
              });

            const notOpened = enriched.filter(p => {
              const alreadyOpened = hasOpened(p.slug);
              log('Filter check', { popupId: p._id, slug: p.slug, alreadyOpened });
              return !alreadyOpened;
            });

            log('Filtered popups summary', { total: enriched.length, notOpened: notOpened.length });

            if (notOpened.length > 0) {
              const popup = notOpened[0];
              log('Selected popup for display', { popupId: popup._id, slug: popup.slug });
              schedulePopup(popup);
            } else {
              log('All popups already shown');
            }
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

      function schedulePopup(popup) {
        state.currentPopup = popup;
        registerView(popup._id);

        log('Scheduling popup display', { delay: CONFIG.POPUP_DELAY_MS, popupId: popup._id });

        state.popupTimeoutId = window.setTimeout(() => {
          log('Displaying popup', { popupId: popup._id });
          renderPopup(popup);
        }, CONFIG.POPUP_DELAY_MS);
      }

      function renderPopup(popup) {
        // Overlay
        const overlay = document.createElement('div');
        overlay.id = 'rakuado-partner-popup-overlay';
        overlay.style.cssText = [
          'position:fixed',
          'top:0',
          'left:0',
          'width:100%',
          'height:100%',
          'background:rgba(0,0,0,0.7)',
          'z-index:2147483646',
          'display:flex',
          'align-items:center',
          'justify-content:center',
          'pointer-events:auto'
        ].join(';');
        document.body.appendChild(overlay);

        // Shadow host
        const host = document.createElement('div');
        host.id = 'rakuado-partner-popup-host';
        host.style.cssText = 'position:relative;z-index:2147483647;pointer-events:auto;';
        overlay.appendChild(host);

        const shadow = host.attachShadow({ mode: 'open' });

        const style = document.createElement('style');
        const accent = popup.accentHex || '#ef4444';
        const logoUrl = popup.logoUrl || popup.imageUrl || '${appDomain}/img/logo.png';
        const headline = popup.headline || 'RakuAdoで広告を始めませんか？';
        style.textContent = \`
          :host { all: initial; }
          *, *::before, *::after { box-sizing: border-box; }
          .modal {
            background: #ffffff;
            border-radius: 20px;
            padding: 40px 36px;
            box-shadow: 0 50px 100px -20px rgba(0,0,0,0.3);
            text-align: center;
            position: relative;
            width: 400px;
            max-width: 92vw;
            animation: fadeIn 0.3s ease-out;
          }
          @keyframes fadeIn {
            from { transform: translateY(14px); opacity: 0; }
            to   { transform: translateY(0);    opacity: 1; }
          }
          .close-btn {
            position: absolute;
            top: 14px;
            right: 14px;
            width: 32px;
            height: 32px;
            border-radius: 9999px;
            border: 1px solid rgba(148,163,184,0.4);
            background: rgba(248,250,252,0.95);
            color: #475569;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            font-size: 18px;
            line-height: 1;
            transition: background 0.2s ease, color 0.2s ease;
          }
          .close-btn:hover {
            background: rgba(226,232,240,0.95);
            color: #1f2937;
          }
          .logo {
            width: 64px;
            height: 64px;
            margin: 0 auto 20px;
            display: block;
            object-fit: contain;
          }
          h2 {
            font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
            font-weight: 700;
            font-size: 22px;
            color: #1f2937;
            margin: 0 0 28px 0;
            line-height: 1.3;
          }
          .cta-btn {
            font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
            font-weight: 600;
            font-size: 16px;
            color: #ffffff;
            padding: 14px 40px;
            border-radius: 9999px;
            border: none;
            cursor: pointer;
            background: linear-gradient(90deg, \${accent}, \${shadeColor(accent, -10)});
            transition: transform 0.15s ease, box-shadow 0.2s ease;
          }
          .cta-btn:hover {
            transform: scale(1.05);
            box-shadow: 0 10px 20px rgba(99,102,241,0.3);
          }
          @media (max-width: 640px) {
            .modal { padding: 28px 20px; }
            h2    { font-size: 18px; }
          }
        \`;
        shadow.appendChild(style);

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = \`
          <button class="close-btn" type="button" aria-label="閉じる">×</button>
          <img class="logo" src="\${logoUrl}" alt="RakuAdo" />
          <h2>\${headline}</h2>
          <button class="cta-btn" type="button">今すぐチェック</button>
        \`;
        shadow.appendChild(modal);

        state.popupRoot = overlay;

        const handleInteraction = (event) => {
          if (state.processingInteraction) {
            log('Interaction already in progress, ignoring duplicate');
            return;
          }
          state.processingInteraction = true;

          event.preventDefault();
          event.stopPropagation();
          log('Popup: User interaction', { popupId: popup._id });
          markOpened(popup.slug);
          dismissPopup();
          backgroundOpen(popup._id, popup.targetUrl, popup.slug);
        };

        modal.querySelector('.close-btn').addEventListener('click', handleInteraction);
        modal.querySelector('.cta-btn').addEventListener('click', handleInteraction);

        // Clicking the backdrop also counts as a click-through
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) handleInteraction(e);
        });
      }

      function dismissPopup() {
        if (state.popupTimeoutId) {
          window.clearTimeout(state.popupTimeoutId);
          state.popupTimeoutId = null;
        }
        if (state.popupRoot && state.popupRoot.parentNode) {
          log('Dismissing popup');
          state.popupRoot.parentNode.removeChild(state.popupRoot);
        }
        state.popupRoot = null;
      }

      /* --------------------
         Helpers
         -------------------- */

      function shadeColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const r = (num >> 16) + amt;
        const g = ((num >> 8) & 0x00FF) + amt;
        const b = (num & 0x0000FF) + amt;
        return \`#\${(
          0x1000000 +
          (r < 255 ? (r < 0 ? 0 : r) : 255) * 0x10000 +
          (g < 255 ? (g < 0 ? 0 : g) : 255) * 0x100 +
          (b < 255 ? (b < 0 ? 0 : b) : 255)
        ).toString(16).slice(1)}\`;
      }

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

        fetchToken(baseUrl)
          .then(res => {
            log('Token response', res);
            if (res && res.token) {
              window.location = \`\${baseUrl}\${baseUrl.includes('?') ? '&' : '?'}t=\${res.token}\`;
            } else {
              window.location = baseUrl;
            }
          })
          .catch(err => {
            warn('Token fetch failed, redirecting without token', err);
            window.location = baseUrl;
          });
      }

      function fetchToken(baseUrl) {
        const origin = new URL(baseUrl).origin;
        return $.post(\`\${origin}/wp-json/myapi/v1/get-token\`,
          { secret: 'KnixnLd3' }, 'json');
      }

      function registerView(popupId) {
        const domain = window.location.hostname;
        log('Registering view', { popupId, domain, partnerId: PARTNER_ID });
        fetch(\`\${CONFIG.PARTNER_API_URL}/register-view?popup=\${popupId}&domain=\${encodeURIComponent(domain)}&partnerId=\${PARTNER_ID}\`)
          .catch(err => warn('Failed to register view', err));
      }

      function registerClick(popupId) {
        const domain = window.location.hostname;
        log('Registering click', { popupId, domain, partnerId: PARTNER_ID });
        fetch(\`\${CONFIG.PARTNER_API_URL}/register-click?popup=\${popupId}&domain=\${encodeURIComponent(domain)}&partnerId=\${PARTNER_ID}\`)
          .catch(err => warn('Failed to register click', err));
      }
    })(jQuery);
  }
})();
`;

    res.send(widgetScript);
  } catch (error) {
    console.error('Error serving partner ad script:', error);
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');

    res.status(500).send('// Error loading partner ad script');
  }
}

// Serve the partner ad widget script - handle both with and without .js extension
router.get(['/', '/.js'], servePartnerAdScript);

// GET enabled popups for a partner
router.get('/enabled', async (req, res) => {
  try {
    const partnerId = req.query.partnerId;
    
    if (!partnerId) {
      return res.status(400).json({ error: 'Partner ID is required' });
    }

    // Validate partner exists
    let partner;
    try {
      partner = await global.db.collection('partnerRequests').findOne({ 
        _id: new ObjectId(partnerId),
        status: { $in: ['approved', 'snippet_sent', 'snippet_verified'] }
      });
    } catch (error) {
      return res.status(400).json({ error: 'Invalid partner ID' });
    }

    if (!partner) {
      return res.status(404).json({ error: 'Partner not found or not approved' });
    }

    // Get all enabled popups (same as referal system)
    const POPUPS = global.db.collection('referalPopups');
    const popups = await POPUPS.find({ 
      enabled: { $ne: false }
    }).sort({ order: 1 }).toArray();
    
    res.json(popups.map(p => ({
      _id: p._id,
      imageUrl: p.imageUrl,
      targetUrl: p.targetUrl,
      order: p.order,
      slug: p.slug || '',
      headline: p.headline || '',
      logoUrl: p.logoUrl || p.imageUrl || '',
      accentHex: p.accentHex || '#ef4444',
      extraDays: p.extraDays || 3
    })));
  } catch (error) {
    console.error('Error fetching enabled popups:', error);
    res.status(500).json({ error: 'Failed to fetch enabled popups' });
  }
});

// GET register a view (by popup id and partner id)
router.get('/register-view', async (req, res) => {
  try {
    const popupId = req.query.popup;
    const domain = req.query.domain || 'unknown';
    const partnerId = req.query.partnerId;
    
    if (!popupId || !partnerId) {
      return res.sendStatus(400);
    }

    // Validate ObjectIds
    let popup, partner;
    try {
      popup = await global.db.collection('referalPopups').findOne({ _id: new ObjectId(popupId) });
      partner = await global.db.collection('partnerRequests').findOne({ _id: new ObjectId(partnerId) });
    } catch (error) {
      return res.sendStatus(400);
    }

    if (!popup || !partner) {
      return res.sendStatus(404);
    }

    // Update popup stats
    await global.db.collection('referalPopups').updateOne(
      { _id: new ObjectId(popupId) }, 
      { $inc: { views: 1 } }
    );

    // Store partner-specific analytics
    const PARTNER_ANALYTICS = global.db.collection('partnerAnalytics');
    const today = new Date().toISOString().split('T')[0];
    
    await PARTNER_ANALYTICS.updateOne(
      {
        partnerId: partnerId,
        popupId: popupId,
        domain: domain,
        date: today
      },
      {
        $inc: { views: 1 },
        $set: {
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );

    // Update refery data (for backward compatibility)
    const POPUPS = global.db.collection('referalPopups');
    const popupData = await POPUPS.findOne({ _id: new ObjectId(popupId) });
    let refery = (popupData.refery || []).filter(r => r.timestamp && r.timestamp >= Date.now() - 24 * 60 * 60 * 1000);
    let found = false;
    refery = refery.map(r => {
      if (r.domain === domain) {
        found = true;
        return { ...r, view: (r.view || 0) + 1, timestamp: Date.now() };
      }
      return r;
    });
    if (!found) refery.push({ domain, view: 1, click: 0, timestamp: Date.now() });
    await POPUPS.updateOne({ _id: new ObjectId(popupId) }, { $set: { refery } });

    return res.sendStatus(200);
  } catch (error) {
    console.error('Error registering view:', error);
    return res.sendStatus(500);
  }
});

// GET register a click (by popup id and partner id)
router.get('/register-click', async (req, res) => {
  try {
    const popupId = req.query.popup;
    const domain = req.query.domain || 'unknown';
    const partnerId = req.query.partnerId;
    
    if (!popupId || !partnerId) {
      return res.sendStatus(400);
    }

    // Validate ObjectIds
    let popup, partner;
    try {
      popup = await global.db.collection('referalPopups').findOne({ _id: new ObjectId(popupId) });
      partner = await global.db.collection('partnerRequests').findOne({ _id: new ObjectId(partnerId) });
    } catch (error) {
      return res.sendStatus(400);
    }

    if (!popup || !partner) {
      return res.sendStatus(404);
    }

    // Update popup stats
    await global.db.collection('referalPopups').updateOne(
      { _id: new ObjectId(popupId) }, 
      { $inc: { clicks: 1 } }
    );

    // Store partner-specific analytics
    const PARTNER_ANALYTICS = global.db.collection('partnerAnalytics');
    const today = new Date().toISOString().split('T')[0];
    
    await PARTNER_ANALYTICS.updateOne(
      {
        partnerId: partnerId,
        popupId: popupId,
        domain: domain,
        date: today
      },
      {
        $inc: { clicks: 1 },
        $set: {
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );

    // Update refery data (for backward compatibility)
    const POPUPS = global.db.collection('referalPopups');
    const popupData = await POPUPS.findOne({ _id: new ObjectId(popupId) });
    let refery = (popupData.refery || []).filter(r => r.timestamp && r.timestamp >= Date.now() - 24 * 60 * 60 * 1000);
    let found = false;
    refery = refery.map(r => {
      if (r.domain === domain) {
        found = true;
        return { ...r, click: (r.click || 0) + 1, timestamp: Date.now() };
      }
      return r;
    });
    if (!found) refery.push({ domain, view: 0, click: 1, timestamp: Date.now() });
    await POPUPS.updateOne({ _id: new ObjectId(popupId) }, { $set: { refery } });

    return res.sendStatus(200);
  } catch (error) {
    console.error('Error registering click:', error);
    return res.sendStatus(500);
  }
});

// Export both the router and the handler function
module.exports = router;
module.exports.servePartnerAdScript = servePartnerAdScript;
