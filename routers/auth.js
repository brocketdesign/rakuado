const express = require('express');
const router = express.Router();
const passport = require('passport');
const dotenv = require("dotenv");
const GoogleStrategy = require("passport-google-oauth20").Strategy;

router.get('/google',
  function(req, res, next) {
    
    const protocol = req.protocol; // 'http' or 'https'
    const host = req.get('host').replace('192.168.10.115','localhost'); // Hostname and possibly the port
    const callbackURL = `${protocol}://${host}/auth/google/callback`;

    console.log({callbackURL})
    
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL: callbackURL,
        },
        async function (accessToken, refreshToken, profile, done) {
          try {
            const users = db.collection('users');
    
            // Try to find the user
            let user = await users.findOne({ social_user_id: profile.id });
    
            // If user doesn't exist, create a new one
            if (!user) {
              const newUser = {
                social_user_id: profile.id,
                name: profile.displayName,
                registration_type: "google",
                // add any other fields you need
              };
              const result = await users.insertOne(newUser);
              user = result.ops[0];
            }
    
            done(null, user);
          } catch (err) {
            console.log(err)
            done(err);
          } 
        }
      )
    );

    next();

    
  },
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login', failureMessage: 'Whoops, something went wrong with Google sign-in!' }),
  function(req, res) {
    // Successful authentication, let's dance our way to the home page!
    res.redirect('/');
  });

  module.exports = router;