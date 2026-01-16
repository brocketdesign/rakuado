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

const { initializeCronJobs } = require('./modules/cronJobs-bot.js');
const { initializeCronJobsForBlogs } = require('./modules/cronJobs-blog.js');
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
      initializeCronJobsForBlogs(db)
      initializeCronJobs(db)
      initializeAnalyticsCronJobs(db)
      initializePartnersCronJobs(db)

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

      // Define and use routers concisely
      const routers = [
        ['/', './routers/index'],
        ['/user', './routers/user'],
        ['/auth', './routers/auth'],
        ['/payment', './routers/payment'],
        ['/dashboard', './routers/dashboard/index'],
        ['/api/generator', './routers/api/generator'],
        ['/api/autoblog', './routers/api/autoblog'],
        ['/api/affiliate', './routers/api/affiliate'],
        ['/api/abtest', './routers/api/abtest'],
        ['/api/referal', './routers/api/referal'],
        ['/api/analytics', './routers/api/analytics'],
        ['/api/partners', './routers/api/partners'],
        ['/api/partner-recruitment', './routers/api/partner-recruitment'],
        ['/api/partner-ad', './routers/api/partner-ad'],
      ];

      routers.forEach(([route, path]) => app.use(route, require(path)));


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
