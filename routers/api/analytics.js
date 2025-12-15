const express = require('express');
const router = express.Router();
const db = global.db;

// Helper function to get custom month period dates (21st to 20th)
function getCustomMonthPeriod(monthsBack = 0) {
  const now = new Date();
  
  // For current period (monthsBack = 0)
  if (monthsBack === 0) {
    // If today is before the 21st, we're still in the previous month's period
    if (now.getDate() < 21) {
      // Period is from 21st of previous month to 20th of current month
      const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 21);
      const endDate = new Date(now.getFullYear(), now.getMonth(), 20, 23, 59, 59, 999);
      return { startDate, endDate };
    } else {
      // Period is from 21st of current month to 20th of next month
      const startDate = new Date(now.getFullYear(), now.getMonth(), 21);
      const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 20, 23, 59, 59, 999);
      return { startDate, endDate };
    }
  } else {
    // For previous periods
    let targetDate = new Date(now);
    
    if (now.getDate() < 21) {
      // Current period hasn't started yet, so adjust
      targetDate = new Date(now.getFullYear(), now.getMonth() - monthsBack - 1, 21);
    } else {
      targetDate = new Date(now.getFullYear(), now.getMonth() - monthsBack, 21);
    }
    
    const startDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 21);
    const endDate = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 20, 23, 59, 59, 999);
    
    return { startDate, endDate };
  }
}

// GET analytics data
router.get('/data', async (req, res) => {
  const { period = 'current', site = 'all' } = req.query;
  
  try {
    let startDate, endDate;
    
    switch (period) {
      case 'current':
        ({ startDate, endDate } = getCustomMonthPeriod(0));
        break;
      case 'previous':
        ({ startDate, endDate } = getCustomMonthPeriod(1));
        break;
      default:
        return res.status(400).json({ error: 'Invalid period' });
    }

    const data = await db.collection('analyticsDaily')
      .find({
        date: {
          $gte: startDate.toISOString().split('T')[0],
          $lte: endDate.toISOString().split('T')[0]
        }
      })
      .sort({ date: 1 })
      .toArray();

    // Create a complete date range with all days from start to end
    const response = [];
    const currentDate = new Date(startDate);
    const endDateTime = new Date(endDate);
    
    while (currentDate <= endDateTime) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const existingData = data.find(item => item.date === dateStr);
      
      const result = {
        date: dateStr,
        views: 0,
        clicks: 0
      };

      if (existingData) {
        if (site === 'all') {
          result.views = existingData.total ? existingData.total.views : 0;
          result.clicks = existingData.total ? existingData.total.clicks : 0;
        } else if (existingData.sites && existingData.sites[site]) {
          result.views = existingData.sites[site].views;
          result.clicks = existingData.sites[site].clicks;
        }
      }

      response.push(result);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    res.json({
      period,
      site,
      data: response,
      periodInfo: {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
      }
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
    const { period = 'current' } = req.query;
    let startDate, endDate;
    
    switch (period) {
      case 'current':
        ({ startDate, endDate } = getCustomMonthPeriod(0));
        break;
      case 'previous':
        ({ startDate, endDate } = getCustomMonthPeriod(1));
        break;
      default:
        return res.status(400).json({ error: 'Invalid period' });
    }

    const data = await db.collection('analyticsDaily')
      .find({
        date: {
          $gte: startDate.toISOString().split('T')[0],
          $lte: endDate.toISOString().split('T')[0]
        }
      })
      .sort({ date: 1 })
      .toArray();

    // Calculate totals for the requested period
    const totals = data.reduce((acc, item) => {
      acc.views += item.total ? item.total.views : 0;
      acc.clicks += item.total ? item.total.clicks : 0;
      return acc;
    }, { views: 0, clicks: 0 });

    // Get today's and yesterday's data (for daily comparison)
    const today = data[data.length - 1] || { total: { views: 0, clicks: 0 } };
    const yesterday = data[data.length - 2] || { total: { views: 0, clicks: 0 } };

    // Determine previous period (one period before the requested period)
    const monthsBackForThisPeriod = period === 'current' ? 1 : 2;
    const { startDate: prevStart, endDate: prevEnd } = getCustomMonthPeriod(monthsBackForThisPeriod);

    const prevData = await db.collection('analyticsDaily')
      .find({
        date: {
          $gte: prevStart.toISOString().split('T')[0],
          $lte: prevEnd.toISOString().split('T')[0]
        }
      })
      .toArray();

    const prevTotals = prevData.reduce((acc, item) => {
      acc.views += item.total ? item.total.views : 0;
      acc.clicks += item.total ? item.total.clicks : 0;
      return acc;
    }, { views: 0, clicks: 0 });

    const periodCtr = totals.views > 0 ? (totals.clicks / totals.views) * 100 : 0;
    const prevCtr = prevTotals.views > 0 ? (prevTotals.clicks / prevTotals.views) * 100 : 0;

    // Compute period-over-previous-period percentage changes (safe numeric values)
    const changePeriodViews = prevTotals.views > 0 ? ((totals.views - prevTotals.views) / prevTotals.views * 100) : 0;
    const changePeriodClicks = prevTotals.clicks > 0 ? ((totals.clicks - prevTotals.clicks) / prevTotals.clicks * 100) : 0;
    const changePeriodCtr = prevCtr > 0 ? ((periodCtr - prevCtr) / prevCtr * 100) : 0;

    // Compute today vs yesterday changes (daily)
    const changeTodayViews = yesterday.total && yesterday.total.views > 0 ? ((today.total.views - yesterday.total.views) / yesterday.total.views * 100) : 0;
    const changeTodayClicks = yesterday.total && yesterday.total.clicks > 0 ? ((today.total.clicks - yesterday.total.clicks) / yesterday.total.clicks * 100) : 0;

    const summary = {
      period: {
        views: totals.views,
        clicks: totals.clicks,
        ctr: Number(periodCtr.toFixed(2)),
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
      },
      today: today.total || { views: 0, clicks: 0 },
      yesterday: yesterday.total || { views: 0, clicks: 0 },
      // Backwards-compatible `change` contains period comparisons (used by summary cards)
      change: {
        views: Number(changePeriodViews.toFixed(1)),
        clicks: Number(changePeriodClicks.toFixed(1)),
        ctr: Number(changePeriodCtr.toFixed(1))
      },
      // Daily change (today vs yesterday) provided separately for accurate "vs yesterday" UI
      dailyChange: {
        views: Number(changeTodayViews.toFixed(1)),
        clicks: Number(changeTodayClicks.toFixed(1))
      }
    };

    res.json(summary);
  } catch (error) {
    console.error('Summary API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST endpoint to initialize/backfill analytics data
router.post('/initialize', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    // Initialize empty records for missing days
    const start = new Date(startDate);
    const end = new Date(endDate);
    const current = new Date(start);
    let initialized = 0;

    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      
      // Check if record already exists
      const existing = await db.collection('analyticsDaily').findOne({ date: dateStr });
      
      if (!existing) {
        await db.collection('analyticsDaily').insertOne({
          date: dateStr,
          timestamp: current.getTime(),
          total: { views: 0, clicks: 0 },
          sites: {}
        });
        initialized++;
      }
      
      current.setDate(current.getDate() + 1);
    }

    res.json({ 
      message: `Initialized ${initialized} empty analytics records`,
      period: { startDate, endDate }
    });
  } catch (error) {
    console.error('Initialize API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST endpoint to manually sync current data to today's analytics
router.post('/sync-today', async (req, res) => {
  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    // Get all popups and their current refery data
    const popups = await db.collection('referalPopups').find({}).toArray();
    
    let totalViews = 0;
    let totalClicks = 0;
    const siteData = {};

    // Process current popup data
    for (const popup of popups) {
      totalViews += popup.views || 0;
      totalClicks += popup.clicks || 0;

      // Process refery data
      const refery = popup.refery || [];
      for (const ref of refery) {
        const domain = ref.domain || 'unknown';
        if (!siteData[domain]) {
          siteData[domain] = { views: 0, clicks: 0 };
        }
        siteData[domain].views += ref.view || 0;
        siteData[domain].clicks += ref.click || 0;
      }
    }

    // Update today's analytics record
    await db.collection('analyticsDaily').replaceOne(
      { date: todayStr },
      {
        date: todayStr,
        timestamp: today.getTime(),
        total: { views: totalViews, clicks: totalClicks },
        sites: siteData
      },
      { upsert: true }
    );

    res.json({ 
      message: 'Successfully synced today\'s data',
      date: todayStr,
      total: { views: totalViews, clicks: totalClicks },
      sites: Object.keys(siteData).length
    });
  } catch (error) {
    console.error('Sync today API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
