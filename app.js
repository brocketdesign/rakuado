require('dotenv').config(); // Load environment variables from .env file

const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const compression = require('compression');
const MongoDBStore = require('connect-mongodb-session')(session);
const passport = require("passport");
const passportConfig = require('./middleware/passport')(passport);
const path = require('path');
const cors = require('cors');
const { connectToDatabase } = require('./utils/db');

// On serverless platforms (e.g. Vercel) each invocation reuses the warm
// process. Killing it on a stray async error would cause the next request
// to pay a full cold-start penalty and produce FUNCTION_INVOCATION_FAILED
// for the in-flight request. Log loudly and keep the process alive; the
// per-request error handler below converts any error reaching a handler
// into a proper 500 response.
process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err && err.stack ? err.stack : err);
});
process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection:', reason);
});

const app = express();

const url = process.env.MONGODB_URL;

// `trust proxy` MUST be set before session/redirect middleware so that
// secure cookies and req.secure work correctly behind Vercel's proxy.
app.set('trust proxy', 1);

// Middleware: ensure the DB is connected before every request.
// connectToDatabase() caches the connection so subsequent calls are instant.
app.use(async (req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (err) {
    console.error('Database connection failed:', err.message);
    return res.status(500).json({ error: 'Database connection failed' });
  }
});

// Build the session store lazily and attach an `error` listener so a
// background connection failure does not crash the serverless runtime.
// `connect-mongodb-session` is an EventEmitter and would otherwise throw
// on an unhandled 'error' event.
let _sessionStore = null;
function getSessionStore() {
  if (_sessionStore) return _sessionStore;
  if (!url) {
    console.warn('MONGODB_URL not set — falling back to in-memory session store');
    return undefined; // express-session will use MemoryStore
  }
  try {
    _sessionStore = new MongoDBStore({
      uri: url,
      collection: 'sessions',
    });
    _sessionStore.on('error', (err) => {
      console.error(
        'Session store error — sessions will be unavailable until reconnect:',
        err && err.message ? err.message : err
      );
    });
  } catch (err) {
    console.error('Failed to initialise session store:', err.message);
    _sessionStore = null;
  }
  return _sessionStore || undefined;
}

// Resolve session secret. If SESSION_SECRET is missing we cannot crash the
// function (that would render the site permanently down on Vercel until the
// env var is configured), but we MUST NOT use a predictable default — that
// would let an attacker forge session cookies. Generate an ephemeral random
// secret per cold start and log a clear warning so the misconfiguration is
// visible in the platform logs.
let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  sessionSecret = require('crypto').randomBytes(32).toString('hex');
  console.warn(
    'SESSION_SECRET is not set — generated an ephemeral secret for this instance. ' +
      'Sessions will be invalidated on every cold start. Configure SESSION_SECRET in your Vercel project settings.'
  );
}

// Session middleware
app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: getSessionStore(),
  })
);

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(compression());
app.use(flash());
app.use((req, res, next) => {
  res.locals.messages = req.flash();
  next();
});
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== 'local' && !process.env.VERCEL && req.header('x-forwarded-proto') !== 'https') {
    res.redirect(`https://${req.header('host')}${req.url}`);
  } else {
    next();
  }
});
app.use(passport.initialize());
app.use(passport.session());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cors());

app.set('view engine', 'pug');
app.set('views', './views');

// Handle partner-ad.js route directly (before other routers to avoid conflicts)
const partnerAdModule = require('./routers/api/partner-ad');
app.get('/api/partner-ad.js', partnerAdModule.servePartnerAdScript);

// Handle partner-metrics.js tracking script route
const partnerMetricsModule = require('./routers/api/partner-metrics');
app.get('/api/partner-metrics.js', partnerMetricsModule.serveMetricsScript);

// Define and use routers
const routers = [
  ['/', './routers/index'],
  ['/user', './routers/user'],
  ['/auth', './routers/auth'],
  ['/payment', './routers/payment'],
  ['/api/affiliate', './routers/api/affiliate'],
  ['/api/abtest', './routers/api/abtest'],
  ['/api/referal', './routers/api/referal'],
  ['/api/analytics', './routers/api/analytics'],
  ['/api/partners', './routers/api/partners'],
  ['/api/partner-recruitment', './routers/api/partner-recruitment'],
  ['/api/partner-portal', './routers/api/partner-portal'],
  ['/api/partner-ad', './routers/api/partner-ad'],
  ['/api/api-keys', './routers/api/api-keys'],
  ['/api/mailing-lists', './routers/api/mailing-lists'],
  ['/api/v1', './routers/api/v1'],
  ['/api/ga', './routers/api/ga'],
  ['/api/advertiser', './routers/api/advertiser'],
  ['/api/ads', './routers/api/ads'],
  ['/api/admin', './routers/api/admin-ads'],
  ['/api/admin', './routers/api/admin-email-config'],
  ['/api/support', './routers/api/support'],
  ['/api/rakubun', './routers/api/rakubun'],
  ['/api/vibedash', './routers/api/vibedash'],
];

routers.forEach(([route, routerPath]) => app.use(route, require(routerPath)));

// Register partner metrics router (loaded above for the .js script route)
app.use('/api/partner-metrics', partnerMetricsModule.router);

// Add partner emails API router
app.use('/api/partners/emails', require('./routers/api/partner-emails'));

// Serve React client build for dashboard and login
const clientDistPath = path.join(__dirname, 'client', 'dist');
app.use('/assets', express.static(path.join(clientDistPath, 'assets')));
app.use('/favicon.svg', express.static(path.join(clientDistPath, 'favicon.svg')));
app.use('/icons.svg', express.static(path.join(clientDistPath, 'icons.svg')));

// SPA fallback: serve React index.html for /dashboard/* and /login routes
const serveReactApp = (req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
};
app.get('/dashboard', serveReactApp);
app.get('/dashboard/*', serveReactApp);
app.get('/login', serveReactApp);

// After first DB connection: create indexes, seed config, and start cron jobs.
// This runs once in the background and does not block request handling.
connectToDatabase()
  .then((db) => {
    // Seed default email notification configs
    const { seedEmailConfig } = require('./services/adminNotifications');
    seedEmailConfig();

    // Create indexes for ad network collections
    Promise.all([
      db.collection('adCampaigns').createIndex({ status: 1, type: 1, startDate: 1, endDate: 1 }),
      db.collection('adBudgetTransactions').createIndex({ advertiserId: 1, createdAt: -1 }),
      db.collection('adBudgetTransactions').createIndex({ campaignId: 1, type: 1, createdAt: -1 }),
      db.collection('adImpressions').createIndex({ campaignId: 1, createdAt: -1 }),
      db.collection('adImpressions').createIndex({ advertiserId: 1, createdAt: -1 }),
      db.collection('adClicks').createIndex({ campaignId: 1, createdAt: -1 }),
      db.collection('adClicks').createIndex({ impressionId: 1, ipHash: 1 }),
      db.collection('adBudgetTransactions').createIndex({ stripeSessionId: 1 }, { sparse: true }),
      db.collection('supportTickets').createIndex({ userId: 1, createdAt: -1 }),
      db.collection('supportTickets').createIndex({ status: 1, createdAt: -1 }),
    ]).catch((err) => console.error('Ad network index creation error:', err));

    // Cron jobs require a persistent process — skip them on Vercel serverless.
    if (!process.env.VERCEL) {
      const { initializeAnalyticsCronJobs } = require('./modules/cronjob-analytics.js');
      const { initializePartnersCronJobs } = require('./modules/cronjob-partners.js');
      initializeAnalyticsCronJobs(db);
      initializePartnersCronJobs(db);
    }
  })
  .catch((err) => console.error('DB initialization error:', err.message));

// Global error handler — must be the last middleware. Without this, an
// uncaught error in any route bubbles up to Vercel as FUNCTION_INVOCATION_FAILED.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled route error:', err && err.stack ? err.stack : err);
  if (res.headersSent) return next(err);
  const wantsJson = req.path.startsWith('/api/') || (req.headers.accept || '').includes('application/json');
  if (wantsJson) {
    res.status(500).json({ error: 'Internal Server Error' });
  } else {
    res.status(500).send('Internal Server Error');
  }
});

// Export the app for Vercel (and any other serverless host).
module.exports = app;

// Start the HTTP server only when running outside of a serverless environment.
if (!process.env.VERCEL) {
  const http = require('http');
  const ip = require('ip');
  const port = process.env.PORT || 3000;
  const server = http.createServer(app);
  server.listen(port, '0.0.0.0', () =>
    console.log(`Express running → PORT http://${ip.address()}:${port}`)
  );
}
