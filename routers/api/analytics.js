const express = require('express');
const router = express.Router();
const db = global.db;
const ensureAuthenticated = require('../../middleware/authMiddleware');

// All analytics routes require authentication and admin access
router.use(ensureAuthenticated);
router.use((req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
});

// Helper to filter refery array to last 24 hours
const filterRecentRefery = (refery) => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return (refery || []).filter(r => r.timestamp && r.timestamp >= cutoff);
};


// Detect if a sorted array of daily records is cumulative (monotonically non-decreasing)
function detectCumulative(data) {
  if (data.length < 3) return false;
  let nonDecreasingCount = 0;
  for (let i = 1; i < data.length; i++) {
    const prevViews = data[i-1].total ? data[i-1].total.views : 0;
    const currViews = data[i].total ? data[i].total.views : 0;
    if (currViews >= prevViews) nonDecreasingCount++;
  }
  return nonDecreasingCount / (data.length - 1) >= 0.9;
}

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

    // Fetch one day before the period start so we can compute the delta for the first day
    const dayBeforeStart = new Date(startDate);
    dayBeforeStart.setDate(dayBeforeStart.getDate() - 1);

    const data = await db.collection('analyticsDaily')
      .find({
        date: {
          $gte: dayBeforeStart.toISOString().split('T')[0],
          $lte: endDate.toISOString().split('T')[0]
        }
      })
      .sort({ date: 1 })
      .toArray();

    // Detect if data is cumulative (values consistently non-decreasing across days)
    // by checking whether the total views are monotonically non-decreasing
    let isCumulative = false;
    if (data.length >= 3) {
      let nonDecreasingCount = 0;
      for (let i = 1; i < data.length; i++) {
        const prevViews = (site === 'all')
          ? (data[i-1].total ? data[i-1].total.views : 0)
          : (data[i-1].sites && data[i-1].sites[site] ? data[i-1].sites[site].views : 0);
        const currViews = (site === 'all')
          ? (data[i].total ? data[i].total.views : 0)
          : (data[i].sites && data[i].sites[site] ? data[i].sites[site].views : 0);
        if (currViews >= prevViews) nonDecreasingCount++;
      }
      // If 90%+ of consecutive days are non-decreasing, it's cumulative
      isCumulative = nonDecreasingCount / (data.length - 1) >= 0.9;
    }

    // Build a lookup map by date
    const dataByDate = {};
    for (const item of data) {
      dataByDate[item.date] = item;
    }

    // Create a complete date range with all days from start to end
    const response = [];
    const currentDate = new Date(startDate);
    const endDateTime = new Date(endDate);
    
    while (currentDate <= endDateTime) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const existingData = dataByDate[dateStr];
      
      const result = {
        date: dateStr,
        views: 0,
        clicks: 0
      };

      if (existingData) {
        let currViews, currClicks;
        if (site === 'all') {
          currViews = existingData.total ? existingData.total.views : 0;
          currClicks = existingData.total ? existingData.total.clicks : 0;
        } else if (existingData.sites && existingData.sites[site]) {
          currViews = existingData.sites[site].views;
          currClicks = existingData.sites[site].clicks;
        } else {
          currViews = 0;
          currClicks = 0;
        }

        if (isCumulative) {
          // Find previous day's data to compute delta
          const prevDate = new Date(currentDate);
          prevDate.setDate(prevDate.getDate() - 1);
          const prevDateStr = prevDate.toISOString().split('T')[0];
          const prevData = dataByDate[prevDateStr];

          let prevViews = 0, prevClicks = 0;
          if (prevData) {
            if (site === 'all') {
              prevViews = prevData.total ? prevData.total.views : 0;
              prevClicks = prevData.total ? prevData.total.clicks : 0;
            } else if (prevData.sites && prevData.sites[site]) {
              prevViews = prevData.sites[site].views;
              prevClicks = prevData.sites[site].clicks;
            }
          }

          result.views = Math.max(0, currViews - prevViews);
          result.clicks = Math.max(0, currClicks - prevClicks);
        } else {
          result.views = currViews;
          result.clicks = currClicks;
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

    // Fetch one day before so we can compute the delta for the first day
    const dayBeforePeriod = new Date(startDate);
    dayBeforePeriod.setDate(dayBeforePeriod.getDate() - 1);

    const data = await db.collection('analyticsDaily')
      .find({
        date: {
          $gte: dayBeforePeriod.toISOString().split('T')[0],
          $lte: endDate.toISOString().split('T')[0]
        }
      })
      .sort({ date: 1 })
      .toArray();

    const isCumulative = detectCumulative(data);

    // If cumulative, period total = last value - first value (which is the day before start)
    // If already deltas, sum them up (excluding the extra day before)
    const startDateStr = startDate.toISOString().split('T')[0];
    const periodData = data.filter(d => d.date >= startDateStr);

    let totals;
    if (isCumulative && data.length >= 2) {
      const firstRecord = data[0]; // day before period or first day
      const lastRecord = data[data.length - 1];
      totals = {
        views: Math.max(0, (lastRecord.total ? lastRecord.total.views : 0) - (firstRecord.total ? firstRecord.total.views : 0)),
        clicks: Math.max(0, (lastRecord.total ? lastRecord.total.clicks : 0) - (firstRecord.total ? firstRecord.total.clicks : 0))
      };
    } else {
      totals = periodData.reduce((acc, item) => {
        acc.views += item.total ? item.total.views : 0;
        acc.clicks += item.total ? item.total.clicks : 0;
        return acc;
      }, { views: 0, clicks: 0 });
    }

    // Get today's and yesterday's daily delta (for daily comparison)
    let todayDelta, yesterdayDelta;
    if (isCumulative && periodData.length >= 2) {
      const last = periodData[periodData.length - 1];
      const secondLast = periodData[periodData.length - 2];
      todayDelta = {
        views: Math.max(0, (last.total ? last.total.views : 0) - (secondLast.total ? secondLast.total.views : 0)),
        clicks: Math.max(0, (last.total ? last.total.clicks : 0) - (secondLast.total ? secondLast.total.clicks : 0))
      };
      if (periodData.length >= 3) {
        const thirdLast = periodData[periodData.length - 3];
        yesterdayDelta = {
          views: Math.max(0, (secondLast.total ? secondLast.total.views : 0) - (thirdLast.total ? thirdLast.total.views : 0)),
          clicks: Math.max(0, (secondLast.total ? secondLast.total.clicks : 0) - (thirdLast.total ? thirdLast.total.clicks : 0))
        };
      } else {
        yesterdayDelta = { views: 0, clicks: 0 };
      }
    } else {
      const today = periodData[periodData.length - 1] || { total: { views: 0, clicks: 0 } };
      const yesterday = periodData[periodData.length - 2] || { total: { views: 0, clicks: 0 } };
      todayDelta = today.total || { views: 0, clicks: 0 };
      yesterdayDelta = yesterday.total || { views: 0, clicks: 0 };
    }

    // Determine previous period (one period before the requested period)
    const monthsBackForThisPeriod = period === 'current' ? 1 : 2;
    const { startDate: prevStart, endDate: prevEnd } = getCustomMonthPeriod(monthsBackForThisPeriod);
    const dayBeforePrevStart = new Date(prevStart);
    dayBeforePrevStart.setDate(dayBeforePrevStart.getDate() - 1);

    const prevData = await db.collection('analyticsDaily')
      .find({
        date: {
          $gte: dayBeforePrevStart.toISOString().split('T')[0],
          $lte: prevEnd.toISOString().split('T')[0]
        }
      })
      .sort({ date: 1 })
      .toArray();

    let prevTotals;
    const isPrevCumulative = detectCumulative(prevData);
    if (isPrevCumulative && prevData.length >= 2) {
      const firstPrev = prevData[0];
      const lastPrev = prevData[prevData.length - 1];
      prevTotals = {
        views: Math.max(0, (lastPrev.total ? lastPrev.total.views : 0) - (firstPrev.total ? firstPrev.total.views : 0)),
        clicks: Math.max(0, (lastPrev.total ? lastPrev.total.clicks : 0) - (firstPrev.total ? firstPrev.total.clicks : 0))
      };
    } else {
      const prevStartStr = prevStart.toISOString().split('T')[0];
      prevTotals = prevData.filter(d => d.date >= prevStartStr).reduce((acc, item) => {
        acc.views += item.total ? item.total.views : 0;
        acc.clicks += item.total ? item.total.clicks : 0;
        return acc;
      }, { views: 0, clicks: 0 });
    }

    const periodCtr = totals.views > 0 ? (totals.clicks / totals.views) * 100 : 0;
    const prevCtr = prevTotals.views > 0 ? (prevTotals.clicks / prevTotals.views) * 100 : 0;

    // Compute period-over-previous-period percentage changes (safe numeric values)
    const changePeriodViews = prevTotals.views > 0 ? ((totals.views - prevTotals.views) / prevTotals.views * 100) : 0;
    const changePeriodClicks = prevTotals.clicks > 0 ? ((totals.clicks - prevTotals.clicks) / prevTotals.clicks * 100) : 0;
    const changePeriodCtr = prevCtr > 0 ? ((periodCtr - prevCtr) / prevCtr * 100) : 0;

    // Compute today vs yesterday changes (daily)
    const changeTodayViews = yesterdayDelta.views > 0 ? ((todayDelta.views - yesterdayDelta.views) / yesterdayDelta.views * 100) : 0;
    const changeTodayClicks = yesterdayDelta.clicks > 0 ? ((todayDelta.clicks - yesterdayDelta.clicks) / yesterdayDelta.clicks * 100) : 0;

    const summary = {
      period: {
        views: totals.views,
        clicks: totals.clicks,
        ctr: Number(periodCtr.toFixed(2)),
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
      },
      today: todayDelta,
      yesterday: yesterdayDelta,
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

    // Process current popup data (last 24h only)
    for (const popup of popups) {
      const refery = filterRecentRefery(popup.refery);
      for (const ref of refery) {
        const domain = ref.domain || 'unknown';
        if (!siteData[domain]) {
          siteData[domain] = { views: 0, clicks: 0 };
        }
        const views = ref.view || 0;
        const clicks = ref.click || 0;
        siteData[domain].views += views;
        siteData[domain].clicks += clicks;
        totalViews += views;
        totalClicks += clicks;
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

// GET /api/analytics/sites-summary - per-site totals for the period (used by simple view)
router.get('/sites-summary', async (req, res) => {
  const { period = 'current' } = req.query;
  try {
    let startDate, endDate;
    switch (period) {
      case 'current': ({ startDate, endDate } = getCustomMonthPeriod(0)); break;
      case 'previous': ({ startDate, endDate } = getCustomMonthPeriod(1)); break;
      default: return res.status(400).json({ error: 'Invalid period' });
    }

    const dayBeforeStart = new Date(startDate);
    dayBeforeStart.setDate(dayBeforeStart.getDate() - 1);

    const data = await db.collection('analyticsDaily')
      .find({
        date: {
          $gte: dayBeforeStart.toISOString().split('T')[0],
          $lte: endDate.toISOString().split('T')[0]
        }
      })
      .sort({ date: 1 })
      .toArray();

    const isCumulative = detectCumulative(data);
    const startDateStr = startDate.toISOString().split('T')[0];

    const siteSet = new Set();
    for (const d of data) {
      if (d.sites) Object.keys(d.sites).forEach(s => siteSet.add(s));
    }

    const sites = [];
    for (const domain of siteSet) {
      let views = 0, clicks = 0;

      // Detect cumulativeness per-site independently, since total.views and
      // sites[domain].views may use different storage strategies (e.g. popup
      // counters vs refery-based running totals). Using only the global
      // isCumulative flag (derived from total.views) can cause the else-branch
      // to sum cumulative per-site values, producing hugely inflated results.
      const siteRecords = data.filter(d => d.sites?.[domain]);
      let isSiteCumulative = false;
      if (siteRecords.length >= 3) {
        let nonDecreasing = 0;
        for (let i = 1; i < siteRecords.length; i++) {
          const prev = siteRecords[i - 1].sites[domain].views || 0;
          const curr = siteRecords[i].sites[domain].views || 0;
          if (curr >= prev) nonDecreasing++;
        }
        isSiteCumulative = nonDecreasing / (siteRecords.length - 1) >= 0.9;
      }

      if (isSiteCumulative && data.length >= 2) {
        const first = data[0];
        const last = data[data.length - 1];
        views = Math.max(0, (last.sites?.[domain]?.views || 0) - (first.sites?.[domain]?.views || 0));
        clicks = Math.max(0, (last.sites?.[domain]?.clicks || 0) - (first.sites?.[domain]?.clicks || 0));
      } else {
        for (const d of data) {
          if (d.date < startDateStr) continue;
          views += d.sites?.[domain]?.views || 0;
          clicks += d.sites?.[domain]?.clicks || 0;
        }
      }
      sites.push({
        domain,
        views,
        clicks,
        ctr: views > 0 ? Number((clicks / views * 100).toFixed(2)) : 0
      });
    }

    sites.sort((a, b) => b.views - a.views);

    res.json({
      period,
      sites,
      periodInfo: {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
      }
    });
  } catch (error) {
    console.error('Sites summary API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/analytics/comparison - daily time series for all sites combined (used by comparison view)
router.get('/comparison', async (req, res) => {
  const { period = 'current' } = req.query;
  try {
    let startDate, endDate;
    switch (period) {
      case 'current': ({ startDate, endDate } = getCustomMonthPeriod(0)); break;
      case 'previous': ({ startDate, endDate } = getCustomMonthPeriod(1)); break;
      default: return res.status(400).json({ error: 'Invalid period' });
    }

    const dayBeforeStart = new Date(startDate);
    dayBeforeStart.setDate(dayBeforeStart.getDate() - 1);

    const data = await db.collection('analyticsDaily')
      .find({
        date: {
          $gte: dayBeforeStart.toISOString().split('T')[0],
          $lte: endDate.toISOString().split('T')[0]
        }
      })
      .sort({ date: 1 })
      .toArray();

    const siteSet = new Set();
    for (const d of data) {
      if (d.sites) Object.keys(d.sites).forEach(s => siteSet.add(s));
    }
    const sites = [...siteSet];

    // Build per-site cumulative flags independently (same rationale as sites-summary).
    const siteCumulativeMap = {};
    for (const site of sites) {
      const siteRecords = data.filter(d => d.sites?.[site]);
      if (siteRecords.length >= 3) {
        let nonDecreasing = 0;
        for (let i = 1; i < siteRecords.length; i++) {
          const prev = siteRecords[i - 1].sites[site].views || 0;
          const curr = siteRecords[i].sites[site].views || 0;
          if (curr >= prev) nonDecreasing++;
        }
        siteCumulativeMap[site] = nonDecreasing / (siteRecords.length - 1) >= 0.9;
      } else {
        siteCumulativeMap[site] = false;
      }
    }

    const dataByDate = {};
    for (const item of data) dataByDate[item.date] = item;

    const response = [];
    const currentDate = new Date(startDate);
    const endDateTime = new Date(endDate);

    while (currentDate <= endDateTime) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const entry = { date: dateStr };

      for (const site of sites) {
        const existing = dataByDate[dateStr];
        let views = existing?.sites?.[site]?.views || 0;
        let clicks = existing?.sites?.[site]?.clicks || 0;

        if (siteCumulativeMap[site]) {
          const prevDate = new Date(currentDate);
          prevDate.setDate(prevDate.getDate() - 1);
          const prevData = dataByDate[prevDate.toISOString().split('T')[0]];
          views = Math.max(0, views - (prevData?.sites?.[site]?.views || 0));
          clicks = Math.max(0, clicks - (prevData?.sites?.[site]?.clicks || 0));
        }

        entry[site] = { views, clicks };
      }

      response.push(entry);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    res.json({
      period,
      sites,
      data: response,
      periodInfo: {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
      }
    });
  } catch (error) {
    console.error('Comparison API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper to extract clean domain from a URL (mirrors partner-metrics.js)
function cleanDomain(url) {
  if (!url) return '';
  let d = url.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '');
  d = d.replace(/^www\./, '');
  d = d.replace(/\/$/, '');
  return d.split('/')[0];
}

// GET /api/analytics/candidate-sites
// Returns partner request candidates (script installed, not yet approved) with their metrics data.
// Admin only (protected by middleware above).
router.get('/candidate-sites', async (req, res) => {
  try {
    const { days = '30' } = req.query;
    const numDays = Math.min(parseInt(days) || 30, 90);

    const candidateStatuses = ['reviewing', 'data_waiting', 'analytics_requested', 'metrics_snippet_sent'];

    const requests = await global.db.collection('partnerRequests')
      .find({ status: { $in: candidateStatuses } })
      .sort({ createdAt: -1 })
      .toArray();

    const today = new Date().toISOString().slice(0, 10);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - numDays);
    const start = startDate.toISOString().slice(0, 10);

    const candidates = await Promise.all(requests.map(async (partnerReq) => {
      const domain = cleanDomain(partnerReq.blogUrl);

      let metrics = { totalPageviews: 0, totalSessions: 0, daily: [] };

      if (domain) {
        const records = await global.db.collection('partnerMetricsDaily')
          .find({ domain, date: { $gte: start, $lte: today } })
          .sort({ date: 1 })
          .toArray();

        let totalPageviews = 0;
        let totalSessions = 0;
        const daily = records.map((r) => {
          totalPageviews += r.pageviews || 0;
          totalSessions += r.uniqueSessions || 0;
          return {
            date: r.date,
            pageviews: r.pageviews || 0,
            sessions: r.uniqueSessions || 0,
          };
        });

        metrics = { totalPageviews, totalSessions, daily };
      }

      return {
        id: partnerReq._id.toString(),
        email: partnerReq.email,
        blogUrl: partnerReq.blogUrl,
        domain,
        status: partnerReq.status,
        currentStep: partnerReq.currentStep,
        dataWaitingStartedAt: partnerReq.dataWaitingStartedAt,
        metricsSnippetSent: partnerReq.metricsSnippetSent || false,
        createdAt: partnerReq.createdAt,
        metrics,
      };
    }));

    res.json({ success: true, candidates, days: numDays });
  } catch (error) {
    console.error('Candidate sites API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
