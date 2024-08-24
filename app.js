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

      app.use(compression());
      app.use(flash());
      app.use((req, res, next) => {
        res.locals.messages = req.flash();
        next();
      });
      
      app.use(passport.initialize());
      app.use(passport.session());

      // Add other middleware
      app.use(express.json());
      app.use(express.urlencoded({ extended: true }));

      app.set('trust proxy', 1); 
      
      const corsOptions = {
          origin: '*',
          methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
          allowedHeaders: 'Content-Type, Authorization',
      };
      
      app.use(cors(corsOptions));

      app.set('view engine', 'pug');
      app.set('views', './views');

      // Define your routers
      const index = require('./routers/index');
      const user = require('./routers/user');
      const auth = require('./routers/auth');
      const payment = require('./routers/payment');
      const dashboard= require('./routers/dashboard/index');
      const generator = require('./routers/api/generator');
      const rss = require('./routers/api/rss');
      const autoblog = require('./routers/api/autoblog');
      const affiliate = require('./routers/api/affiliate');
      
      app.use('/', index); 
      app.use('/user', user); 
      app.use('/auth', auth); 
      app.use('/payment', payment);
      app.use('/dashboard', dashboard);
      app.use('/api/generator', generator);
      app.use('/api/rss', rss);
      app.use('/api/autoblog', autoblog);
      app.use('/api/affiliate', affiliate);



      server.listen(port, () => 
      console.log(`Express running → PORT http://${ip.address()}:${port}`));

    })
    .catch(err => {
      console.log('Error occurred while connecting to MongoDB...\n', err);
    });
}

startServer();
