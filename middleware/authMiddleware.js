const { ObjectId } = require('mongodb');

async function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  } else {
    const { randomkey, userID } = req.query;
    if (randomkey && userID) {
      try {
        const user = await global.db.collection('users').findOne({
          _id: new ObjectId(userID),
          randomkey,
          isKeyActive: false
        });

        if (user && new Date() - user.randomkey_date < 1800000) {
          await global.db.collection('users').updateOne(
            { _id: new ObjectId(userID) },
            { $set: { isKeyActive: true } }
          );

          console.log(`User ${userID} authenticated with randomkey, isKeyActive set to true`);

          req.login(user, (err) => {
            if (err) {
              console.error(`Error logging in the user after signup. Error: ${err.message}`);
              req.flash('error', 'An error occurred during login after signup. Please log in manually.');
              return res.redirect('/');
            }
            
            req.flash('info', 'Successfully signed up and logged in!');
            return next();
          });

          // Prevents the final res.redirect('/user/login') from executing
          return;
        } else {
          console.log('Either user not found, randomkey mismatched, or signup_date is too old');
          req.flash('error', 'Invalid signup details or signup session has expired.');
        }
      } catch (err) {
        console.log('Error during database query:', err);
      }
    }

    res.redirect('/');
  }
}

module.exports = ensureAuthenticated;
