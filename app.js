require('dotenv').config(); // Load environment variables from .env file

const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const compression = require('compression');
const http = require('http');
const LocalStrategy = require('passport-local').Strategy;
const { MongoClient, ObjectId } = require('mongodb');
const MongoDBStore = require('connect-mongodb-session')(session);
const { StableDiffusionApi } = require("stable-diffusion-api");

const { initializeAnalyticsCronJobs } = require('./modules/cronjob-analytics.js');
const { initializePartnersCronJobs } = require('./modules/cronjob-partners.js');

const passport = require("passport");
const passportConfig = require('./middleware/passport')(passport);
const path = require('path'); // Add path module
const ip = require('ip');
const app = express();
const server = http.createServer(app);
const cors = require('cors');
const port = process.env.PORT || 3000;

const url = process.env.MONGODB_URL; // Use MONGODB_URL from .env file
const dbName = process.env.MONGODB_DATABASE; // Use MONGODB_DATABASE from .env file

function startServer() {
  console.log('Attempting to connect to MongoDB...');
  console.log('MongoDB URL:', url ? url.replace(/\/\/[^:]+:[^@]+@/, '//***:***@') : 'NOT SET');
  console.log('Database Name:', dbName || 'NOT SET');
  
  if (!url || !dbName) {
    console.error('MongoDB connection string or database name not found in environment variables');
    process.exit(1);
  }

  MongoClient.connect(url, { 
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 10000, // 10 seconds timeout
    connectTimeoutMS: 10000,
    socketTimeoutMS: 0,
    maxPoolSize: 10
  })
    .then(client => {
      console.log('✅ Successfully connected to MongoDB');

      const db = client.db(dbName); // Use the database name from .env file
      global.db = db; // Save the db connection in a global variable
      initializeAnalyticsCronJobs(db)
      initializePartnersCronJobs(db)

      // Seed default email notification configs
      const { seedEmailConfig } = require('./services/adminNotifications');
      seedEmailConfig();

      // Use the express-session middleware
      app.use(
        session({
          secret: process.env.SESSION_SECRET, // Use SESSION_SECRET from .env file
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

      // Add other middleware
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

      // Define and use routers concisely
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

      routers.forEach(([route, path]) => app.use(route, require(path)));

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


      server.listen(port, '0.0.0.0', () => 
      console.log(`Express running → PORT http://${ip.address()}:${port}`));

    })
    .catch(err => {
      console.error('❌ MongoDB connection failed:');
      console.error('Error details:', err.message);
      console.error('Error code:', err.code);
      
      if (err.code === 'ESERVFAIL' || err.code === 'ENOTFOUND') {
        console.error('');
        console.error('🔧 DNS/Network issue detected. Possible solutions:');
        console.error('1. Check your internet connection');
        console.error('2. Verify the MongoDB URL in your .env file');
        console.error('3. Ensure the MongoDB cluster is running and accessible');
        console.error('4. Check if you need to whitelist your IP address in MongoDB Atlas');
        console.error('');
        console.error('Current MongoDB URL (sanitized):', url ? url.replace(/\/\/[^:]+:[^@]+@/, '//***:***@') : 'NOT SET');
      }
      
      console.error('');
      console.error('⏳ Retrying connection in 5 seconds...');
      setTimeout(() => {
        console.log('🔄 Retrying MongoDB connection...');
        startServer();
      }, 5000);
    });
}

startServer();
