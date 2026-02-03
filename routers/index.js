const express = require('express');
const router = express.Router();
const axios = require('axios');

// Require and use 'express-session' middleware
const session = require('express-session');
const { email, sendEmail, sendEmailWithUserSettings } = require('../services/email')


router.get('/',async(req, res, next) => {
  if (req.isAuthenticated()) {
    return res.redirect('/dashboard'); // Redirect to the dashboard if user is logged in
  }

  // Set the mode to 1 in the session
  req.session.mode = '1';
  const faq = require('../services/faq')

  res.render('index',{faq, isPublic: true}); // Render the top page template
});

// This route renders the contact form
router.get('/contact', async (req, res, next) => {
  res.render('contact', { user: req.user, sent: false, isPublic: true });
});

// This route renders the contact form with a success message after the emails are sent
router.get('/contact-success', async (req, res, next) => {
  res.render('contact', { user: req.user, sent: true, isPublic: true });
});

// This route handles the form submission
router.post('/contact', (req, res) => {
  const { name, email, message } = req.body;

  const EmailDataForAdmin = {
      username: name,
      email: email,
      message: message
  };

  const EmailDataForUser = {
      username: name
  };

  const sendEmailToAdmin = sendEmail('admin@hatoltd.com', 'contact form admin', EmailDataForAdmin);
  const sendEmailToUser = sendEmail(email, 'contact form user', EmailDataForUser);

  // Sending both emails in parallel using Promise.all
  Promise.all([sendEmailToAdmin, sendEmailToUser])
      .then(() => {
          console.log('Both emails sent!');
          
          // Redirect to the GET route with a success flag
          res.redirect('/contact-success');
      })
      .catch(error => {
          console.error(`Error sending emails: ${error}`);
          res.status(500).send('Error sending emails.');
      });
});



// Handle GET request for /about-us
router.get('/about-us', (req, res) => {
  // Log that a GET request has been received for /about-us
  console.log('GET request received for /about-us');
  const user = req.user 
  // Render the 'about-us' template
  res.render('about-us',{user, isPublic: true});
});

// Partner recruitment landing page
router.get('/partner-recruitment', async (req, res) => {
  const sent = req.query.sent === 'true';
  res.render('partner-recruitment', { user: req.user, sent, error: null, isPublic: true });
});

// Partner recruitment success page
router.get('/partner-recruitment/success', async (req, res) => {
  res.render('partner-recruitment', { user: req.user, sent: true, error: null, isPublic: true });
});

// Handle partner recruitment form submission
router.post('/partner-recruitment', async (req, res) => {
  try {
    const { email, blogUrl, message } = req.body;

    // Validation
    if (!email || !blogUrl) {
      return res.render('partner-recruitment', { 
        user: req.user, 
        sent: false, 
        error: 'メールアドレスとブログURLは必須項目です。',
        isPublic: true
      });
    }

    // Save to database
    const partnerRequestsCollection = global.db.collection('partnerRequests');
    const requestData = {
      email,
      blogUrl,
      message: message || '',
      status: 'pending', // pending, analytics_requested, approved, rejected
      currentStep: 'submitted', // submitted, analytics_requested, reviewing, approved, snippet_sent, snippet_verified, rejected
      createdAt: new Date(),
      updatedAt: new Date(),
      googleAnalyticsUrl: null,
      googleAnalyticsSubmitted: false,
      snippetSent: false,
      snippetVerified: false,
      estimatedMonthlyAmount: null,
      notes: ''
    };

    const result = await partnerRequestsCollection.insertOne(requestData);

    // Send email to admin
    const EmailDataForAdmin = {
      email,
      blogUrl,
      message: message || '（なし）',
      requestId: result.insertedId.toString(),
      createdAt: new Date().toLocaleString('ja-JP')
    };

    // Use user's configured mail settings if available (for admin users submitting from dashboard)
    // Otherwise use system email
    // Send to both contact@hatoltd.com and rakuadojapan@gmail.com
    try {
      const adminEmails = ['contact@hatoltd.com', 'rakuadojapan@gmail.com'];
      const emailPromises = [];
      
      if (req.user && req.user._id) {
        const user = await global.db.collection('users').findOne({ _id: req.user._id });
        if (user && user.mailSettings && user.mailSettings.email && user.mailSettings.password) {
          // Send to both emails using user's mail settings
          for (const adminEmail of adminEmails) {
            emailPromises.push(
              sendEmailWithUserSettings(user.mailSettings, adminEmail, 'partner recruitment admin', EmailDataForAdmin)
            );
          }
        } else {
          // Send to both emails using system email
          for (const adminEmail of adminEmails) {
            emailPromises.push(
              sendEmail(adminEmail, 'partner recruitment admin', EmailDataForAdmin)
            );
          }
        }
      } else {
        // Send to both emails using system email
        for (const adminEmail of adminEmails) {
          emailPromises.push(
            sendEmail(adminEmail, 'partner recruitment admin', EmailDataForAdmin)
          );
        }
      }
      
      // Send all emails in parallel
      await Promise.all(emailPromises);
    } catch (emailError) {
      console.error('Error sending admin notification email:', emailError);
      // Continue even if email fails - don't block the form submission
    }

    // Redirect to success page
    res.redirect('/partner-recruitment/success');
  } catch (error) {
    console.error('Error processing partner recruitment:', error);
    res.render('partner-recruitment', { 
      user: req.user, 
      sent: false, 
      error: '送信に失敗しました。もう一度お試しください。',
      isPublic: true
    });
  }
});

// Export the router
module.exports = router;
