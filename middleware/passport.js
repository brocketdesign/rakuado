const bcrypt = require("bcrypt");
const dotenv = require("dotenv");
const dotenvConfig = require("dotenv").config();
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const FacebookStrategy = require("passport-facebook").Strategy;
const { MongoClient, ObjectId } = require('mongodb');
//
//
//  PASSPORT CONFIG
//
//
module.exports = function (passport) {
   // Passport config

    passport.serializeUser(function (user, done) {
        done(null, user._id.toString()); // Convert ObjectId to string
    });

    passport.deserializeUser(function (id, done) {
        db.collection('users')
        .findOne({ _id: new ObjectId(id) })
        .then(user => {
            done(null, user);
        })
        .catch(err => {
            done(err, null);
        });
    });

      passport.use(
        new LocalStrategy({
          usernameField: 'email',
          passwordField: 'password'
        },function (email, password, done) {
          db.collection('users')
            .findOne({ email })
            .then(user => {
              if (!user) {
                console.log('LocalStrategy: No user found with this username.');
                return done(null, false, { message: 'Incorrect username.' });
              }
              console.log('LocalStrategy: User found, comparing passwords...');
              // Use bcrypt to compare the input password with the hashed password in the database
              bcrypt.compare(password, user.password).then(isMatch => {
                if (isMatch) {
                  console.log('LocalStrategy: Passwords match, login successful.');
                  return done(null, user);
                } else {
                  console.log('LocalStrategy: Passwords do not match.');
                  return done(null, false, { message: 'Incorrect password.' });
                }
              })
              .catch(err => {
                console.log('Error during password comparison:', err);
                return done(err);
              });
            })
            .catch(err => {
              console.log('Error in LocalStrategy:', err);
              return done(err);
            });
        })
      );

    }


