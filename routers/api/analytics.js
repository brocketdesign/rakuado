const express = require('express');
const router = express.Router();
const db = global.db;

// GET analytics data
router.get('/data', async (req, res) => {
  const { period = 'day', site = 'all' } = req.query;
  
  try {
    let collection;
    let dateField;
    let limit;

    switch (period) {
      case 'day':
        collection = db.collection('analyticsDaily');
        dateField = 'date';
        limit = 7;
        break;
      case 'week':
        collection = db.collection('analyticsWeekly');
        dateField = 'weekStart';
        limit = 4;
        break;
      case 'month':
        collection = db.collection('analyticsMonthly');
        dateField = 'monthStart';
        limit = 12;
        break;
      default:
        return res.status(400).json({ error: 'Invalid period' });
    }

    const data = await collection
      .find({})
      .sort({ [dateField]: -1 })
      .limit(limit)
      .toArray();

    // Reverse to get chronological order
    data.reverse();

    // Format response based on site filter
    const response = data.map(item => {
      const result = {
        date: item[dateField],
        views: 0,
        clicks: 0
      };

      if (site === 'all') {
        result.views = item.total.views;
        result.clicks = item.total.clicks;
      } else if (item.sites[site]) {
        result.views = item.sites[site].views;
        result.clicks = item.sites[site].clicks;
      }

      return result;
    });

    res.json({
      period,
      site,
      data: response
    });
  } catch (error) {
    console.error('Analytics API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET available sites
router.get('/sites', async (req, res) => {
  try {
    const dailyData = await db.collection('analyticsDaily')
      .find({})
      .sort({ date: -1 })
      .limit(1)
      .toArray();

    const sites = ['all'];
    if (dailyData.length > 0 && dailyData[0].sites) {
      sites.push(...Object.keys(dailyData[0].sites));
    }

    res.json({ sites });
  } catch (error) {
    console.error('Sites API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET summary stats
router.get('/summary', async (req, res) => {
  try {
    const today = await db.collection('analyticsDaily')
      .findOne({}, { sort: { date: -1 } });

    const yesterday = await db.collection('analyticsDaily')
      .findOne({}, { sort: { date: -1 }, skip: 1 });

    const summary = {
      today: today ? today.total : { views: 0, clicks: 0 },
      yesterday: yesterday ? yesterday.total : { views: 0, clicks: 0 },
      change: {
        views: 0,
        clicks: 0
      }
    };

    if (yesterday && yesterday.total.views > 0) {
      summary.change.views = ((summary.today.views - summary.yesterday.views) / summary.yesterday.views * 100).toFixed(1);
    }
    if (yesterday && yesterday.total.clicks > 0) {
      summary.change.clicks = ((summary.today.clicks - summary.yesterday.clicks) / summary.yesterday.clicks * 100).toFixed(1);
    }

    res.json(summary);
  } catch (error) {
    console.error('Summary API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
