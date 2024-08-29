const express = require('express');
const router = express.Router();
const axios = require('axios');
const { ObjectId } = require('mongodb');
const url = require('url');
const {updateFavicon} = require('../../services/tools')


// Route to check the plugin activation status from WordPress
router.get('/check-plugin-status', async (req, res) => {
    const { affiliateId } = req.query; // Get affiliateId from query parameters

    if (!affiliateId) {
        return res.status(400).json({ message: 'Affiliate ID is required as a query parameter.' });
    }

    try {
        // Find the affiliate in the database using ObjectId
        const affiliate = await global.db.collection('affiliate').findOne({ _id: new ObjectId(affiliateId) });

        if (!affiliate || !affiliate.wordpressUrl) {
            return res.status(404).json({ message: 'Affiliate not found or WordPress URL missing' });
        }

        const wordpressUrl = affiliate.wordpressUrl;
        const apiKey = 'MIICXAIBAAKBgQCqGSM44QXyqES1b45TqJiWaqR5WQj86fTpTnmvXopbEwq7XQ6h'; // The API Key, securely handled

        // Make the API request to the WordPress URL
        const response = await axios.get(`${wordpressUrl}/wp-json/custompopup/v1/status/`, {
            params: { api_key: apiKey }
        });

        res.status(200).json({
            message: 'Successfully fetched plugin status',
            status: response.data.status  // Assuming the response from WP is { status: 'active' }
        });
    } catch (error) {
        res.status(error.response?.status || 500).json({
            message: 'Error fetching plugin status from the provided URL',
            error: error.message
        });
    }
});
// Endpoint to check popup authorization
router.get('/check-popup-authorization', async (req, res) => {
    try {
        // Extract the domain query parameter
        const { domain } = req.query;

        if (!domain) {
            return res.status(400).json({ error: 'Domain parameter is required' });
        }

        // Assuming 'affiliate' collection has documents with a 'domain' and 'isActive' fields
        const affiliate = await global.db.collection('affiliate').findOne({ domain });

        if (!affiliate) {
            return res.status(404).json({ error: 'Affiliate not found' });
        }

        // Check if the affiliate is active
        if (affiliate.isActive) {
            res.json({ authorized: true, affiliateId:affiliate._id });
        } else {
            res.json({ authorized: false });
        }
    } catch (error) {
        console.error('Failed to check popup authorization:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Route to log popup events
router.get('/log-popup-event', async (req, res) => {
    const { affiliateId, action } = req.query;

    if (!affiliateId || !action) {
        return res.status(400).send({ message: "Missing affiliateId or action parameter" });
    }

    try {
        // Find the affiliate in the database
        const affiliate = await global.db.collection('affiliate').findOne({ _id: new ObjectId(affiliateId) });
        if (!affiliate) {
            return res.status(404).send({ message: "Affiliate not found" });
        }

        
        const today = new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' });
        const dateObj = new Date(today + ' UTC');
        const formattedDate = dateObj.toISOString().split('T')[0];

        // Extract the year and month for monthly logging
        const yearMonth = formattedDate.slice(0, 7); // YYYY-MM

        // Log the event in affiliate-analytic for daily counts
        await global.db.collection('affiliate-analytic').updateOne(
            { affiliateId: new ObjectId(affiliateId), date: formattedDate, action },
            { $inc: { count: 1 } },
            { upsert: true }
        );

        // Log or update the monthly event count in a separate monthly analytics collection
        await global.db.collection('affiliate-monthly-analytic').updateOne(
            { affiliateId: new ObjectId(affiliateId), month: yearMonth, action },
            { $inc: { count: 1 } },
            { upsert: true }
        );

        res.send({ message: "Popup event logged successfully" });
    } catch (error) {
        console.error("Error logging popup event:", error);
        res.status(500).send({ message: "Failed to log popup event" });
    }
});
router.get('/fetch-popup-data', async (req, res) => {
    const { affiliateId, action, today } = req.query;

    if (!affiliateId || !action || !today) {
        return res.status(400).send({ message: "Missing required parameters: affiliateId, action, or today" });
    }

    try {
        const yearMonth = today.slice(0, 7); // Extract YYYY-MM for the month

        // Fetch daily data
        const dailyData = await global.db.collection('affiliate-analytic').findOne({
            affiliateId: new ObjectId(affiliateId),
            date: today,
            action: action
        });

        // Fetch monthly data
        const monthlyData = await global.db.collection('affiliate-monthly-analytic').findOne({
            affiliateId: new ObjectId(affiliateId),
            month: yearMonth,
            action: action
        });
        
        res.send({
            daily: dailyData ? dailyData.count : 0, // Provide 0 if no record is found
            monthly: monthlyData ? monthlyData.count : 0 // Provide 0 if no record is found
        });
    } catch (error) {
        console.error("Error fetching popup data:", error);
        res.status(500). send({ message: "Failed to fetch popup data" });
    }
});
router.get('/fetch-popup-data-range', async (req, res) => {
    const { affiliateId, action, startDate, endDate } = req.query;
    if (!affiliateId || !action || !startDate || !endDate) {
        return res.status(400).send({ message: "Missing required parameters" });
    }

    try {
        const data = await global.db.collection('affiliate-analytic').aggregate([
            {
                $match: {
                    affiliateId: new ObjectId(affiliateId),
                    action: action,
                    date: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    _id: "$date",
                    count: { $sum: "$count" }
                }
            },
            {
                $sort: { _id: 1 }
            }
        ]).toArray();

        res.send(data);
    } catch (error) {
        console.error("Error fetching range data:", error);
        res.status(500).send({ message: "Failed to fetch data" });
    }
});

router.get('/details/:affiliateID', async (req, res) => {
    try {
        const { affiliateID } = req.params;
        const affiliate = await global.db.collection('affiliate').findOne({ _id: new ObjectId(affiliateID) });
        
        if (!affiliate) {
            res.status(404).send({ message: 'Affiliate not found' });
        } else {
            res.status(200).json(affiliate);
        }
    } catch (error) {
        console.error('Error retrieving affiliate data:', error);
        res.status(500).send({ message: 'Error retrieving data from database' });
    }
});


// Route to get all affiliate data
router.get('/all-affiliate-data', async (req, res) => {
    try {
        const affiliates = await global.db.collection('affiliate').find({}).sort({_id:-1}).toArray();
        res.status(200).json(affiliates);
    } catch (error) {
        res.status(500).send({ message: 'Error fetching affiliate data', error: error.message });
    }
});
router.get('/affiliate-data', async (req, res) => {
    try {
        const userId = new ObjectId(req.query.userId); // Assuming you pass the userId as a query parameter
        if (!userId) {
            return res.status(400).send({ message: 'UserId parameter is required' });
        }

        const userData = await global.db.collection('affiliate').findOne({ _id: userId });
        if (userData) {
            res.status(200).send(userData);
        } else {
            res.status(404).send({ message: 'User not found' });
        }
    } catch (error) {
        res.status(500).send({ message: 'Error retrieving user data', error: error.message });
    }
});

router.post('/affiliate-data', async (req, res) => {
    try {
        const affiliateId = new ObjectId(req.body.affiliateId); // The ID of the user to update
        const updates = req.body.updates; // The data to update

        if (!affiliateId || !updates) {
            return res.status(400).send({ message: 'affiliateId and updates data are required' });
        }
        const result = await global.db.collection('affiliate').updateOne({ _id: affiliateId }, { $set: updates });
        if (result.modifiedCount === 0) {
            return res.status(404).send({ message: 'User not found or no updates made' });
        }
        updateFavicon();
        res.status(200).send({ message: 'User data updated successfully' });
    } catch (error) {
        res.status(500).send({ message: 'Error updating user data', error: error.message });
    }
});

router.post('/receive-affiliate-data', async (req, res) => {
    try {
        const userData = req.body; // Data sent from the form
        console.log(`Adding new affiliate`)
        if (Object.keys(userData).length === 0) {
            return res.status(400).send({ message: 'No user data provided' });
        }

        // Extract the domain from the wordpressUrl
        if (userData.wordpressUrl) {
            const parsedUrl = new URL(userData.wordpressUrl);
            userData.domain = parsedUrl.hostname; // Extracts domain name
        } else {
            return res.status(400).send({ message: 'wordpressUrl is required' });
        }

        // Prepare the update options
        const filter = { domain: userData.domain };
        const update = { $set: userData };
        const options = { upsert: true }; // Create a new document if one doesn't exist

        const result = await global.db.collection('affiliate').updateOne(filter, update, options);

        // Determine the appropriate response based on the operation performed
        if (result.upsertedCount > 0) {
            res.status(201).send({
                message: 'New user data added successfully',
                userId: result.upsertedId._id,
                domain: userData.domain
            });
        } else if (result.modifiedCount > 0) {
            res.status(200).send({
                message: 'User data updated successfully',
                domain: userData.domain
            });
        } else {
            res.status(200).send({
                message: 'No changes made to user data',
                domain: userData.domain
            });
        }
    } catch (error) {
        console.log(error)
        res.status(500).send({
            message: 'Error receiving user data',
            error: error.message
        });
    }
});

router.delete('/delete-affiliate/:id', async (req, res) => {
    const affiliateId = req.params.id;

    try {
        const result = await global.db.collection('affiliate').deleteOne({ _id: new ObjectId(affiliateId) });
        if (result.deletedCount === 1) {
            res.status(200).send({ message: 'Affiliate deleted successfully' });
        } else {
            res.status(404).send({ message: 'Affiliate not found' });
        }
    } catch (error) {
        res.status(500).send({ message: 'Failed to delete affiliate', error: error.message });
    }
});


// Route to manage Google Analytics
const { google } = require('googleapis');

// Google Analytics setup
const analytics = google.analytics({
  version: 'v3',
  auth: new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
    credentials: {
      client_id: process.env.GOOGLE_ANALYTICS_CLIENT_ID,
      client_secret: process.env.GOOGLE_ANALYTICS_CLIENT_SECRET,
    }
  }),
});

// API to fetch and save data
router.get('/fetch-analytics', async (req, res) => {
  try {
    const affiliates = await global.db.collection('affiliate').find({analyticsViewId:{$exists:true}}).toArray();
    const results = [];

    for (let affiliate of affiliates) {
      const response = await analytics.data.ga.get({
        'ids': 'ga:' + affiliate.analyticsViewId, // Assumes you store the Google Analytics View ID
        'start-date': '30daysAgo',
        'end-date': 'today',
        'metrics': 'ga:users',
      });

      const data = {
        wordpressUrl: affiliate.wordpressUrl,
        users: response.data.totalsForAllResults['ga:users'],
      };

      results.push(data);
      
      // Save or update the data in MongoDB
      await global.db.collection('analyticsData').updateOne(
        { wordpressUrl: affiliate.wordpressUrl },
        { $set: data },
        { upsert: true }
      );
    }

    res.json(results);
  } catch (error) {
    console.error('Failed to fetch data:', error);
    res.status(500).send('Failed to fetch data');
  }
});

// Scheduled task to refresh data daily
const cron = require('node-cron');
cron.schedule('0 0 * * *', () => {
  console.log('Refreshing data...');
  app.emit('fetch-analytics');
});

router.post('/save-ga-view-id', async (req, res) => {
    const { websiteId, analyticsViewId } = req.body;
    try {
        // Assuming 'affiliates' is your collection where you save the data
        await global.db.collection('affiliates').updateOne(
            { _id: new ObjectId(websiteId) },
            { $set: { analyticsViewId: analyticsViewId } },
            { upsert: true }
        );
        res.send({ status: 'success', message: 'GA View ID saved successfully!' });
    } catch (error) {
        console.error('Failed to save GA View ID:', error);
        res.status(500).send({ status: 'error', message: 'Failed to save GA View ID' });
    }
});

module.exports = router;
