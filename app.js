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

const app = express();

const url = process.env.MONGODB_URL;

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

// Session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: new MongoDBStore({
      uri: url,
      collection: 'sessions',
    }),
  })
);

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static('uploads'));

app.use(compression());
app.use(flash());
app.use((req, res, next) => {
  res.locals.messages = req.flash();
  next();
});
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== 'local' && req.header('x-forwarded-proto') !== 'https') {
    res.redirect(`https://${req.header('host')}${req.url}`);
  } else {
    next();
  }
});
app.use(passport.initialize());
app.use(passport.session());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set('trust proxy', 1);
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
