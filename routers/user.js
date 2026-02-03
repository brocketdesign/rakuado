const express = require('express');
const multer = require('multer');
const {
  formatDateToDDMMYYHHMMSS,
  addUsertoFreePlan
} = require('../services/tools')

const router = express.Router();
const bcrypt = require('bcrypt');
const passport = require('passport');
const { email, sendEmail } = require('../services/email')

const { ObjectId } = require('mongodb');
const { hostname } = require('os');

// Add this helper at the top
function isValidObjectId(id) {
  return typeof id === 'string' && /^[a-fA-F0-9]{24}$/.test(id);
}

router.get('/setting', (req, res) => {
  console.log('User setting page requested');
  
  // Get default mail settings from environment variables (Mailtrap API)
  const defaultMailSettings = {
    apiKey: process.env.MAILTRAP_API_KEY || '',
    useSandbox: process.env.MAILTRAP_USE_SANDBOX === 'true',
    inboxId: process.env.MAILTRAP_INBOX_ID || '',
    fromEmail: process.env.MAILTRAP_FROM_EMAIL || process.env.MAIL_TRAP_USERNAME || '',
    configured: !!process.env.MAILTRAP_API_KEY,
    // Legacy SMTP settings (for reference)
    host: process.env.MAIL_TRAP_SMTP || '',
    port: process.env.MAIL_TRAP_PORT || '',
    user: process.env.MAIL_TRAP_USERNAME || '',
    pass: process.env.MAIL_TRAP_PASSWORD || ''
  };
  
  res.render('user/setting', {
    user: req.user,
    defaultMailSettings: defaultMailSettings,
    isPublic: false
  }); // Render the login template
});

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, process.env.UPLOAD_STORAGE_FOLDER);
  },
  filename: function (req, file, cb) {
    cb(null, `${file.fieldname}-${req.user._id}-${formatDateToDDMMYYHHMMSS()}.jpg`);
  }
});


const upload = multer( {storage: storage });

router.post('/updateProfile', upload.fields([{ name: 'profileImage' }, { name: 'bannerImage' }, {name : 'imageUpload'}]), async (req, res) => {

  try {
      let user

      if(req.body.resetToken){
        // Find the user with the matching reset token
        user = await global.db.collection('users').findOne({ resetToken : req.body.resetToken });
      }else{
        user = req.user
      }

      const userId = user._id;  // Retrieve user ID from req object
      const updatedInfo = req.body;  // Retrieve updated data from form submission
      updatedInfo.galleryImages = user.galleryImages || []

      //console.log(req.body) 
      //console.log(req.files) 

      if (req.files) {

        let profileImage = req.files['profileImage'] ? `${process.env.UPLOAD_STORAGE_FOLDER.replace('public','')}${req.files['profileImage'][0].filename}` : null;
        let bannerImage = req.files['bannerImage'] ? `${process.env.UPLOAD_STORAGE_FOLDER.replace('public','')}${req.files['bannerImage'][0].filename}` : null;
        let galleryImage = req.files['imageUpload'] ? `${process.env.UPLOAD_STORAGE_FOLDER.replace('public','')}${req.files['imageUpload'][0].filename}` : null;

        // If a file was uploaded, add the file path to the user's data
        if (profileImage) {
          updatedInfo.profileImage = profileImage;
        }
        if (bannerImage) {
          updatedInfo.bannerImage = bannerImage;
        }
        if (galleryImage) {
          // Assuming updatedInfo.galleryImages is initially an empty array or already an array
          updatedInfo.galleryImages.push(galleryImage);
        }
      }
      if(updatedInfo.userPassword){
        updatedInfo.password = await bcrypt.hash(updatedInfo.userPassword, 10);
        user.password = updatedInfo.password

        const EmailData = {
          username: user.username, 
        };
    
        sendEmail(user.email, 'password update', EmailData)
          .then(() => console.log('Email sent!'))
          .catch(error => console.error(`Error sending email: ${error}`));

      }
      // Use global.db to get a reference to the users collection
      const usersCollection = global.db.collection('users');

      // Update user in the collection
      await usersCollection.updateOne({ _id: new ObjectId(userId) }, { $set: updatedInfo });

      if(req.body.resetToken){
        await global.db.collection('users').updateOne({ resetToken : req.body.resetToken },{$set:{resetToken:false,validityToken:false}});
      }
      
      res.json({ status: 'success', message: 'Profile has been updated.' });
  } catch (error) {
    console.log(error)
      res.json({ status: 'error', message: 'An error occurred while updating the profile.' });
  }
});

// POST /login
router.post('/login', async (req, res, next) => {
  try {
    // Destructure email from request body
    const { email } = req.body;

    // Log received email
    console.log(`Received email: ${email}`);

    // Check if the email exists in the 'users' collection
    const existingUser = await global.db.collection('users').findOne({ email: email });

    // Log existing user
    console.log(`Existing user: ${JSON.stringify(existingUser)}`);

    if (existingUser) {
      // If the email exists, execute the login function
      return await login(req,res);
    } else {
      // If the email doesn't exist, execute the signup function
      return await signup(req,res);
    }
  } catch (error) {
    console.log(`Error occurred: ${error}`);
    res.status(500).send('An error occurred');
  }
});

  async function login(req,res){
    const { email } = req.body;

    // Check if email is provided and is valid
    if (!email || !/^[\w._%+-]+@[\w.-]+\.[a-zA-Z]{2,4}$/.test(email)) {
      console.log(`Login failed. Invalid email provided: ${email}`);
      return res.send({ 
        prelog: false, 
        status: false, 
        message: 'Please provide a valid email address.' 
      });
    }
  
    console.log(`Received login request for Email: ${email}`);
  
    try {
      // Find existing user
      const existingUser = await global.db.collection('users').findOne({ email: email });
  
      if (!existingUser) {
        console.log(`Login failed. User with Email: ${email} not found.`);
        return res.send({
          prelog: false, 
          status: false, 
          message: 'User with this email does not exist.'
        });
      }
  
      // Generate a new randomkey for login
      const randomkey = Math.random().toString(36).slice(-8);
      const hash_randomkey = await bcrypt.hash(randomkey, 10);
  
      // Update the randomkey and its timestamp in the database
      await global.db.collection('users').updateOne(
        { email: email },
        {
          $set: {
            randomkey: hash_randomkey,
            isKeyActive:false,
            randomkey_date: new Date()
          }
        }
      );
  
      console.log(`Randomkey updated for Email: ${email}`);
  
      // Send the randomkey via email
      const hostname = req.hostname;
      const loginEmailData = {
        FIRSTNAME: existingUser.username,
        RANDOMKEY: hash_randomkey,
        HOSTNAME: hostname,
        USERID: existingUser._id
      };
  
      sendEmail(email, 'login', loginEmailData)
        .then(() => console.log('Login Email sent!'))
        .catch(error => console.error(`Error sending login email: ${error}`));
  
      return res.send({
        prelog: true,
        status: true, 
        userID: existingUser._id,
        message:'Verify your email to login'
      });
  
    } catch (err) {
      console.error(`Login error for Email: ${email}. Error: ${err.message}`);
      return res.send({
        prelog:false,
        status:false,
        message:'An error occurred during login. Please try again.'
      });
    }
  }

  async function signup(req,res){
    const { email } = req.body;

    // Check if email is provided and is valid
    if (!email || !/^[\w._%+-]+@[\w.-]+\.[a-zA-Z]{2,4}$/.test(email)) {
      console.log(`Signup failed. Invalid email provided: ${email}`);
      return res.send({ 
        prelog: false, 
        status: false, 
        message: 'Please provide a valid email address.' 
      });
    }
    
    console.log(`Received signup request for Email: ${email}`);
    
    try {
      const existingUser = await global.db.collection('users').findOne({ email: email });
    
      if (existingUser) {
        console.log(`Signup failed. User with Email: ${email} already exists.`);
        return res.send({
          prelog: false, 
          status: false, 
          message: 'A user with this email already exists.'
        });
      }
    
      // Here, you might want to generate a random username or some other mechanism
      // since you don't have a username in the request body.
      const generatedUsername = `${Math.random().toString(36).substring(7)}`;
      const password = Math.random().toString(36).slice(-8);
      const hash = await bcrypt.hash(password, 10);
      const randomkey = Math.random().toString(36).slice(-8);
      const hash_randomkey = await bcrypt.hash(randomkey, 10);
      // Add user to freePlan on Stripe and get Stripe info
      const stripeInfo = await addUsertoFreePlan(email);
  
      // Insert the user along with Stripe info into the database
      const result = await global.db.collection('users').insertOne({
        signup_date: new Date(),
        email: email,
        username: generatedUsername,
        password: hash,
        randomkey:hash_randomkey,
        isKeyActive:false,
        randomkey_date: new Date(),
        ...stripeInfo
      });
  
      console.log(`User successfully created. Email: ${email}, Username: ${generatedUsername}, ID: ${result.insertedId}`);
      const newUser = await global.db.collection('users').findOne({ _id: result.insertedId });
      const hostname = req.hostname;
  
      const welcomeEmailData = {
        FIRSTNAME: generatedUsername, 
        PASSWORD: password,
        HOSTNAME:hostname,
        RANDOMKEY:hash_randomkey,
        USERID:result.insertedId
      };
    
      sendEmail(email, 'welcome', welcomeEmailData)
        .then(() => console.log('Email sent!'))
        .catch(error => console.error(`Error sending email: ${error}`));
  
      return res.send({
        presign: true,
        status: true, 
        userID: result.insertedId,
        message:'Verify your email to login'
      });
      
  
    } catch (err) {
      console.error(`Signup error for Email: ${email}. Error: ${err.message}`);
      return res.send({
        prelog:false,
        status:false,
        message:'An error occurred during signup. Please try again.'
      });    
    }
  }
  

  router.get('/logout', (req, res) => {
    console.log('Logout requested');
  
    req.logout(function(err) {
      req.session.destroy((err) => {
        if (err) {
          console.log('Error : Failed to destroy the session during logout.', err);
        } else {
          req.user = null;
          console.log('Logout response: Redirecting to /');
          res.redirect('/');
        }
      });
    });
    
  });
  

router.post('/isOldPasswordCorrect', (req, res) => {
  const { oldPassword } = req.body;
  const storedPassword = req.user.password;

  bcrypt.compare(oldPassword, storedPassword).then(isMatch => {
    if (isMatch) {
      console.log('LocalStrategy: Old Passwords match.');
      res.status(200).json({ isMatch: true });
    } else {
      console.log('LocalStrategy: Old Passwords do not match.');
      res.status(200).json({ isMatch: false });
    }
  }).catch(err => {
    console.error(err);
    res.status(500).json({ message: 'An error occurred while verifying the old password.' });
  });
});

router.post('/reset', async (req, res) => {
  const { mode } = req.body;
  console.log('Reset data for mode:',mode)
  try{
    if(!mode){
      console.log('All data reseted ! For user:',req.user.id)
      await global.db.collection('users').updateOne({_id: new ObjectId(req.user._id)},
      {$set:{
        scrapInfo:{},
        scrapedData:[],
      }})
    }
    res.status(200).json({ message: 'Data deleted' });
  }catch{
    res.status(500).json({ message: 'An error occurred while deleting data.' });

  }

});

// Endpoint to get the current user's credits
router.get('/credits', async (req, res) => {
  if (!req.user || !req.user._id) return res.status(401).json({ error: 'Unauthorized' });
  try {
      const userId = req.user._id;
      const user = await global.db.collection('users').findOne({ _id: userId }, { projection: { credits: 1 } });

      if (!user) {
          return res.status(404).json({ error: 'User not found.' });
      }
      const userCredit = user.credits ? user.credits : 0
      res.json({ credits: userCredit });
  } catch (error) {
      console.error('Failed to get user credits:', error);
      res.status(500).json({ error: 'Internal server error.' });
  }
});
// Endpoint to check if the current user is an administrator
router.get('/is-admin', async (req, res) => {
  if (!req.user || !req.user.email) return res.status(401).json({ error: 'Unauthorized' });
  try {
      const adminEmails = ["rakuadojapan@gmail.com","japanclassicstore@gmail.com"]; // List of administrator emails
      const userEmail = req.user.email;

      if (adminEmails.includes(userEmail)) {
          return res.json({ isAdmin: true });
      } else {
          return res.json({ isAdmin: false });
      }
  } catch (error) {
      console.error('Failed to check if user is admin:', error);
      res.status(500).json({ error: 'Internal server error.' });
  }
});

// Endpoint to save mail settings
router.post('/mailSettings', async (req, res) => {
  if (!req.user || !req.user._id) return res.status(401).json({ error: 'Unauthorized' });
  
  try {
    const { mailProvider, mailEmail, mailPassword, mailHost, mailPort } = req.body;

    // Validate required fields
    if (!mailProvider || !mailEmail) {
      return res.status(400).json({ status: 'error', message: 'Provider and email are required.' });
    }

    // Define SMTP settings based on provider
    let host, port;
    if (mailProvider === 'gmail') {
      host = 'smtp.gmail.com';
      port = 587;
    } else if (mailProvider === 'zoho') {
      host = 'smtp.zoho.com';
      port = 587;
    } else {
      return res.status(400).json({ status: 'error', message: 'Invalid email provider.' });
    }

    // Prepare mail settings object
    const mailSettings = {
      provider: mailProvider,
      email: mailEmail,
      host: host,
      port: port
    };

    // Only update password if it was provided (not masked)
    if (mailPassword && !mailPassword.startsWith('••••')) {
      mailSettings.password = mailPassword;
    } else if (req.user.mailSettings && req.user.mailSettings.password) {
      // Keep existing password if not changed
      mailSettings.password = req.user.mailSettings.password;
    }

    // Update user in the collection
    await global.db.collection('users').updateOne(
      { _id: new ObjectId(req.user._id) },
      { $set: { mailSettings: mailSettings } }
    );

    res.json({ status: 'success', message: 'Mail settings have been saved successfully.' });
  } catch (error) {
    console.error('Failed to save mail settings:', error);
    res.status(500).json({ status: 'error', message: 'An error occurred while saving mail settings.' });
  }
});

// Endpoint to send test mail
router.post('/sendTestMail', async (req, res) => {
  if (!req.user || !req.user._id) return res.status(401).json({ error: 'Unauthorized' });
  
  try {
    const user = await global.db.collection('users').findOne({ _id: new ObjectId(req.user._id) });

    if (!user || !user.mailSettings || !user.mailSettings.email || !user.mailSettings.password) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Please configure your mail settings first before sending a test email.' 
      });
    }

    // Create nodemailer transport with user's mail settings
    const nodemailer = require('nodemailer');
    const userTransport = nodemailer.createTransport({
      host: user.mailSettings.host,
      port: user.mailSettings.port,
      secure: user.mailSettings.port === 465, // true for 465, false for other ports
      auth: {
        user: user.mailSettings.email,
        pass: user.mailSettings.password
      }
    });

    // Send test email
    const testEmailData = {
      from: user.mailSettings.email,
      to: req.user.email, // Send to user's account email
      subject: 'Test Email from Rakuado',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #667eea;">Test Email Successful!</h2>
          <p>Congratulations! Your email configuration is working correctly.</p>
          <p>This is a test email sent from your configured mail account (<strong>${user.mailSettings.email}</strong>) using <strong>${user.mailSettings.provider}</strong>.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">Sent at: ${new Date().toLocaleString()}</p>
        </div>
      `,
      text: `Test Email Successful! Your email configuration is working correctly. This is a test email sent from ${user.mailSettings.email} using ${user.mailSettings.provider}.`
    };

    await userTransport.sendMail(testEmailData);

    res.json({ 
      status: 'success', 
      message: `Test email has been sent successfully to ${req.user.email}. Please check your inbox.` 
    });
  } catch (error) {
    console.error('Failed to send test email:', error);
    
    let errorMessage = 'An error occurred while sending the test email.';
    if (error.code === 'EAUTH') {
      errorMessage = 'Authentication failed. Please check your email and app password.';
    } else if (error.code === 'ECONNECTION') {
      errorMessage = 'Connection failed. Please check your SMTP settings.';
    }

    res.status(500).json({ status: 'error', message: errorMessage });
  }
});

// Endpoint to send test mail using default email system (Mailtrap API)
router.post('/sendDefaultTestMail', async (req, res) => {
  if (!req.user || !req.user._id) return res.status(401).json({ error: 'Unauthorized' });
  
  try {
    // Check if Mailtrap API is configured
    const apiKey = process.env.MAILTRAP_API_KEY;
    const useSandbox = process.env.MAILTRAP_USE_SANDBOX === 'true';
    const inboxId = process.env.MAILTRAP_INBOX_ID ? parseInt(process.env.MAILTRAP_INBOX_ID) : undefined;
    const fromEmail = process.env.MAILTRAP_FROM_EMAIL || process.env.MAIL_TRAP_USERNAME || 'noreply@rakuado.com';
    const fromName = process.env.MAILTRAP_FROM_NAME || process.env.COMPANY_NAME || 'Rakuado';

    if (!apiKey) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Default email system is not configured. Please set MAILTRAP_API_KEY in environment variables.' 
      });
    }

    // Initialize Mailtrap client
    const { MailtrapClient } = require('mailtrap');
    const mailtrapClient = new MailtrapClient({
      token: apiKey,
      sandbox: useSandbox,
      testInboxId: inboxId,
    });

    // Send test email via Mailtrap API
    const testEmailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #667eea;">Default Email System Test Successful!</h2>
        <p>Congratulations! The default email system (Mailtrap API) is working correctly.</p>
        <p>This is a test email sent from the default email system (fallback system).</p>
        <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #495057;">Configuration Details:</h3>
          <ul style="color: #6c757d;">
            <li><strong>API Key:</strong> ${apiKey.substring(0, 10)}••••••••</li>
            <li><strong>Mode:</strong> ${useSandbox ? 'Sandbox' : 'Production'}</li>
            <li><strong>From Email:</strong> ${fromEmail}</li>
            ${inboxId ? `<li><strong>Inbox ID:</strong> ${inboxId}</li>` : ''}
          </ul>
        </div>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #666; font-size: 12px;">Sent at: ${new Date().toLocaleString('ja-JP')}</p>
        <p style="color: #666; font-size: 12px;">This email is used as a fallback when user mail settings are not configured.</p>
      </div>
    `;

    await mailtrapClient.send({
      from: {
        name: fromName,
        email: fromEmail
      },
      to: [{ email: req.user.email }],
      subject: 'Test Email from Default Email System (Mailtrap API) - Rakuado',
      html: testEmailHtml,
      text: `Default Email System Test Successful!\n\nThis is a test email sent from the default email system using Mailtrap API.\n\nConfiguration:\n- Mode: ${useSandbox ? 'Sandbox' : 'Production'}\n- From Email: ${fromEmail}\n\nSent at: ${new Date().toLocaleString('ja-JP')}`,
      category: 'Test Email'
    });

    res.json({ 
      status: 'success', 
      message: `Test email has been sent successfully to ${req.user.email} using the Mailtrap API. Please check your inbox${useSandbox ? ' or Mailtrap sandbox' : ''}.` 
    });
  } catch (error) {
    console.error('Failed to send test email with default system:', error);
    
    let errorMessage = 'An error occurred while sending the test email.';
    if (error.response && error.response.data) {
      errorMessage = `Mailtrap API error: ${JSON.stringify(error.response.data)}`;
    } else if (error.message) {
      errorMessage = error.message;
    }

    res.status(500).json({ status: 'error', message: errorMessage });
  }
});

module.exports = router;
