const express = require('express');
const router = express.Router();

const fs = require('fs');
const OpenAI = require('mongodb');
const { premiumPlan} = require('../../modules/products')
const ensureAuthenticated = require('../../middleware/authMiddleware');
const ensureMembership = require('../../middleware/ensureMembership');
const {sendEmail} = require('../../services/email')
const path = require('path');
const { ObjectId } = require('mongodb');
const axios = require('axios');
const POPUPS = global.db.collection('referalPopups');

// Route for handling '/dashboard/'
router.get('/', ensureAuthenticated, ensureMembership, async (req, res) => {
  try {
    res.render('dashboard/top',{user:req.user});
    //res.redirect('/dashboard/app/affiliate/');
  } catch (error) {
    res.status(500).send('Server Error');
  }
}); 
// Route to render the A/B test creation page
router.get('/app/create-ab-test', (req, res) => {
  res.render('dashboard/app/abtest/create-ab-test',{user:req.user}); // Render the PUG template
});
router.get('/app/ab-test-results', async (req, res) => {
  const { affiliateId } = req.query; // Optional query parameter

  try {
      // Build the API URL with or without affiliateId
      let apiUrl = `${req.protocol}://${req.get('host')}/api/abtest/get-ab-test-results?userId=${req.user._id}`;
      if (affiliateId) {
          apiUrl += `?affiliateId=${affiliateId}`;
      }

      // Fetch data from the API
      const response = await axios.get(apiUrl);
      const results = response.data;

      res.render('dashboard/app/abtest/list', { user:req.user, results, affiliateId });
  } catch (error) {
      console.error('Failed to fetch A/B test results:', error);
      res.status(500).send('Failed to fetch A/B test results');
  }
});

//Route for handling '/affiliate/'
router.get('/app/affiliate/', ensureAuthenticated,ensureMembership, async (req, res) => {  
  res.render('dashboard/app/affiliate/list',{user:req.user,title:"RAKUBUN - Dashboard"});
});
router.get('/app/affiliate/status', ensureAuthenticated,ensureMembership, async (req, res) => {  
  res.render('dashboard/app/affiliate/status',{user:req.user,title:"RAKUBUN - Dashboard"});
});
router.get('/app/affiliate/graph/:affiliateId', ensureAuthenticated,ensureMembership, async (req, res) => {  
  const affiliateId = req.params.affiliateId
  res.render('dashboard/app/affiliate/graph',{user:req.user,affiliateId, title:"RAKUBUN - Dashboard"});
});
// Route for handling '/generator/'
router.get('/app/generator/:appname', ensureAuthenticated,ensureMembership, async (req, res) => {  
  const appname = req.params.appname
  res.render('dashboard/app/generator/'+appname,{user:req.user,title:"RAKUBUN - Dashboard"});
});
// Route for handling '/rss/'
router.get('/app/rss', ensureAuthenticated,ensureMembership, async (req, res) => {  
  res.render('dashboard/app/rss/index',{user:req.user,title:"RAKUBUN - Dashboard"});
  
});
// Route for handling '/feed/'
router.get('/app/feed', ensureAuthenticated,ensureMembership, async (req, res) => {  
  res.render('dashboard/app/rss/feed',{user:req.user,title:"RAKUBUN - Dashboard"});
});
// Assuming 'ensureAuthenticated' and 'ensureMembership' middleware functions are correctly setting up 'req.user'

router.get('/app/autoblog', ensureAuthenticated, ensureMembership, async (req, res) => {
  const blogId = req.query.blogId ? new ObjectId(req.query.blogId) : null
  const botId = req.query.botId && req.query.botId != 'undefined'
  ? new ObjectId(req.query.botId) : null
  const userId = new ObjectId(req.user._id)
  let blogData
  let botData
  let postData
  try {
    // Fetching blog data for the current user
    blogData = await global.db.collection('blogInfos').find({userId: userId}).toArray()                  

    if(blogId != null){
      blogData = await global.db.collection('blogInfos').findOne({_id : blogId})
      botData = await global.db.collection('botInfos').find({blogId : req.query.blogId}).toArray();
    }

    if(botId != null){
      botData = await global.db.collection('botInfos').findOne({_id : botId})
      postData = await global.db.collection('articles').find({botId}).toArray();
    }

    res.render('dashboard/app/autoblog/list', {
      user: req.user,
      blogData, 
      botData,
      postData,
      botId,
      blogId,
      title: "RAKUBUN - Dashboard"
    });
  } catch (error) {
    console.log(error);
    res.status(500).send('Internal server error');
  }
});

router.get('/app/autoblog/bot/', async (req, res) => {
  let { blogId, botId } =  req.query || null
  try {

    if(!blogId){
      blogId = await global.db.collection('botInfos').findOne({_id:new ObjectId(botId)})
      .then((botInfo)=>{
        return botInfo.blogId
      })
    }

    res.render('dashboard/app/autoblog/bot', {
      user: req.user,
      blogId, 
      botId,
      title: "RAKUBUN - Dashboard"
    });
  } catch (error) {
    console.log(error);
    res.status(500).send('Internal server error');
  }
});

router.get('/app/autoblog/blog-info/:blogId?', async (req, res) => {
  const { blogId } = req.params || null; // Extract blogId from URL parameters, if available

  try {
    res.render('dashboard/app/autoblog/blog-info', {
      user: req.user,
      blogId, // Pass the specific blog info or null to the template
      title: "RAKUBUN - Dashboard"
    });
  } catch (error) {
    console.log(error);
    res.status(500).send('Internal server error');
  }
});

router.get('/app/referal', ensureAuthenticated, ensureMembership, async (req, res) => {
  // Fetch all popups (no userId filter)
  const popups = await POPUPS.find({}).sort({ order: 1 }).toArray();

  const q = parseInt(req.query.popup, 10);
  const popupData = !isNaN(q)
    ? await POPUPS.findOne({ popup: q })
    : { popup: '', imageUrl: '', targetUrl: '' };
  res.render('dashboard/app/referal/index', { user: req.user, popups, popupData });
});

// Analytics route
router.get('/app/analytics', ensureAuthenticated, ensureMembership, async (req, res) => {
  try {
    const dailyData = await global.db.collection('analyticsDaily')
      .find({})
      .sort({ date: -1 })
      .limit(30)
      .toArray();

    const weeklyData = await global.db.collection('analyticsWeekly')
      .find({})
      .sort({ weekStart: -1 })
      .limit(12)
      .toArray();

    const monthlyData = await global.db.collection('analyticsMonthly')
      .find({})
      .sort({ monthStart: -1 })
      .limit(12)
      .toArray();

    res.render('dashboard/app/analytics/index', {
      user: req.user,
      dailyData,
      weeklyData,
      monthlyData,
      title: "RAKUBUN - Dashboard"
    });
  } catch (error) {
    console.error('Error fetching analytics data:', error);
    res.status(500).send('Internal server error');
  }
});

module.exports = router;
