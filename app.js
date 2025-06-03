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
  MongoClient.connect(url, { useUnifiedTopology: true })
    .then(client => {
      console.log('Connected to MongoDB...');

      const db = client.db(dbName); // Use the database name from .env file
      global.db = db; // Save the db connection in a global variable
      initializeCronJobsForBlogs(db)
      initializeCronJobs(db)
      initializeAnalyticsCronJobs(db)

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
        ['/api/amalytics', './routers/api/analytics'],
      ];

      routers.forEach(([route, path]) => app.use(route, require(path)));


      server.listen(port, '0.0.0.0', () => 
      console.log(`Express running → PORT http://${ip.address()}:${port}`));

    })
    .catch(err => {
      console.log('Error occurred while connecting to MongoDB...\n', err);
    });
}

startServer();
