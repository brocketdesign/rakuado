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
    res.render('dashboard/top',{user:req.user, isPublic: false});
    //res.redirect('/dashboard/app/affiliate/');
  } catch (error) {
    res.status(500).send('Server Error');
  }
}); 
// Route to render the A/B test creation page
router.get('/app/create-ab-test', (req, res) => {
  res.render('dashboard/app/abtest/create-ab-test',{user:req.user, isPublic: false}); // Render the PUG template
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

      res.render('dashboard/app/abtest/list', { user:req.user, results, affiliateId, isPublic: false });
  } catch (error) {
      console.error('Failed to fetch A/B test results:', error);
      res.status(500).send('Failed to fetch A/B test results');
  }
});

//Route for handling '/affiliate/'
router.get('/app/affiliate/', ensureAuthenticated,ensureMembership, async (req, res) => {  
  res.render('dashboard/app/affiliate/list',{user:req.user,title:"RAKUBUN - Dashboard", isPublic: false});
});
router.get('/app/affiliate/status', ensureAuthenticated,ensureMembership, async (req, res) => {  
  res.render('dashboard/app/affiliate/status',{user:req.user,title:"RAKUBUN - Dashboard", isPublic: false});
});
router.get('/app/affiliate/graph/:affiliateId', ensureAuthenticated,ensureMembership, async (req, res) => {  
  const affiliateId = req.params.affiliateId
  res.render('dashboard/app/affiliate/graph',{user:req.user,affiliateId, title:"RAKUBUN - Dashboard", isPublic: false});
});
router.get('/app/referal', ensureAuthenticated, ensureMembership, async (req, res) => {
  // Fetch all popups (no userId filter)
  const popupsRaw = await POPUPS.find({}).sort({ order: 1 }).toArray();

  const popups = popupsRaw.map(p => {
    const refery = (p.refery && Array.isArray(p.refery)) ? p.refery : [];
    const recent = refery.filter(r => r && r.timestamp && r.timestamp >= Date.now() - 24 * 60 * 60 * 1000);
    const views24h = recent.reduce((sum, r) => sum + (r.view || 0), 0);
    const clicks24h = recent.reduce((sum, r) => sum + (r.click || 0), 0);
    return {
      ...p,
      views24h,
      clicks24h
    };
  });

  const q = parseInt(req.query.popup, 10);
  const popupData = !isNaN(q)
    ? await POPUPS.findOne({ popup: q })
    : { popup: '', imageUrl: '', targetUrl: '' };
  res.render('dashboard/app/referal/index', { user: req.user, popups, popupData, isPublic: false });
});

// Analytics route
router.get('/app/analytics', ensureAuthenticated, ensureMembership, async (req, res) => {
  try {
    res.render('dashboard/app/analytics/index', {
      user: req.user,
      title: "RAKUBUN - Analytics Dashboard",
      isPublic: false
    });
  } catch (error) {
    console.error('Error rendering analytics dashboard:', error);
    res.status(500).send('Internal server error');
  }
});

// Partners management route (admin tool)
router.get('/app/partners', ensureAuthenticated, ensureMembership, async (req, res) => {
  try {
    res.render('dashboard/app/partners/index', {
      user: req.user,
      title: "RAKUBUN - パートナー支払い管理",
      isPublic: false
    });
  } catch (error) {
    console.error('Error rendering partners dashboard:', error);
    res.status(500).send('Internal server error');
  }
});

// Partner list management route
router.get('/app/partner-list', ensureAuthenticated, ensureMembership, async (req, res) => {
  try {
    res.render('dashboard/app/partner-list/index', {
      user: req.user,
      title: "RAKUBUN - パートナー一覧",
      isPublic: false
    });
  } catch (error) {
    console.error('Error rendering partner list dashboard:', error);
    res.status(500).send('Internal server error');
  }
});

// Partner recruitment management route
router.get('/app/partner-recruitment', ensureAuthenticated, ensureMembership, async (req, res) => {
  try {
    res.render('dashboard/app/partner-recruitment/index', {
      user: req.user,
      title: "RAKUBUN - パートナー募集管理",
      isPublic: false
    });
  } catch (error) {
    console.error('Error rendering partner recruitment dashboard:', error);
    res.status(500).send('Internal server error');
  }
});

// API Keys management route
router.get('/app/api-keys', ensureAuthenticated, ensureMembership, async (req, res) => {
  try {
    res.render('dashboard/app/api-keys/index', {
      user: req.user,
      title: "Rakuado - API Keys",
      baseUrl: `${req.protocol}://${req.get('host')}`,
      isPublic: false
    });
  } catch (error) {
    console.error('Error rendering API keys dashboard:', error);
    res.status(500).send('Internal server error');
  }
});

// API Documentation route
router.get('/app/api-docs', ensureAuthenticated, ensureMembership, async (req, res) => {
  try {
    res.render('dashboard/app/api-docs/index', {
      user: req.user,
      title: "Rakuado - API Documentation",
      baseUrl: `${req.protocol}://${req.get('host')}`,
      isPublic: false
    });
  } catch (error) {
    console.error('Error rendering API documentation:', error);
    res.status(500).send('Internal server error');
  }
});

// Mailing lists management route
router.get('/app/mailing-lists', ensureAuthenticated, ensureMembership, async (req, res) => {
  try {
    res.render('dashboard/app/mailing-lists/index', {
      user: req.user,
      title: "Rakuado - Mailing Lists",
      isPublic: false
    });
  } catch (error) {
    console.error('Error rendering mailing lists dashboard:', error);
    res.status(500).send('Internal server error');
  }
});

// Partner emails management route
router.get('/app/partner-emails', ensureAuthenticated, ensureMembership, async (req, res) => {
  try {
    res.render('dashboard/app/partner-emails/index', {
      user: req.user,
      title: "RAKUBUN - パートナーメール管理",
      isPublic: false
    });
  } catch (error) {
    console.error('Error rendering partner emails dashboard:', error);
    res.status(500).send('Internal server error');
  }
});

module.exports = router;
