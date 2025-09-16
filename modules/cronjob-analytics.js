const cron = require('node-cron');

function initializeAnalyticsCronJobs(db) {
  const POPUPS = db.collection('referalPopups');
  const ANALYTICS_DAILY = db.collection('analyticsDaily');
  const ANALYTICS_WEEKLY = db.collection('analyticsWeekly');
  const ANALYTICS_MONTHLY = db.collection('analyticsMonthly');

  // Run daily at 00:01
  cron.schedule('1 0 * * *', async () => {
    console.log('Running daily analytics aggregation...');
    await aggregateDailyAnalytics(POPUPS, ANALYTICS_DAILY, ANALYTICS_WEEKLY, ANALYTICS_MONTHLY);
  });

  // Run hourly backup to ensure data preservation
  cron.schedule('0 * * * *', async () => {
    console.log('Running hourly analytics backup...');
    await backupCurrentAnalytics(POPUPS, ANALYTICS_DAILY);
  });

  console.log('Analytics cron jobs initialized');
}

// Backup current analytics data every hour to prevent data loss
async function backupCurrentAnalytics(POPUPS, ANALYTICS_DAILY) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  try {
    // Get current daily record
    let dailyRecord = await ANALYTICS_DAILY.findOne({ date: todayStr });
    
    if (!dailyRecord) {
      // Initialize today's record if it doesn't exist
      dailyRecord = {
        date: todayStr,
        timestamp: today.getTime(),
        total: { views: 0, clicks: 0 },
        sites: {}
      };
    }

    // Get all popups and their current refery data
    const popups = await POPUPS.find({}).toArray();
    const currentSiteData = {};

    for (const popup of popups) {
      const refery = popup.refery || [];
      for (const ref of refery) {
        const domain = ref.domain || 'unknown';
        if (!currentSiteData[domain]) {
          currentSiteData[domain] = { views: 0, clicks: 0 };
        }
        currentSiteData[domain].views += ref.view || 0;
        currentSiteData[domain].clicks += ref.click || 0;
      }
    }

    // Merge with existing data (to preserve historical data within the day)
    for (const [domain, data] of Object.entries(currentSiteData)) {
      if (!dailyRecord.sites[domain]) {
        dailyRecord.sites[domain] = { views: 0, clicks: 0 };
      }
      // Only update if current data is higher (prevents going backwards)
      if (data.views > dailyRecord.sites[domain].views) {
        dailyRecord.sites[domain].views = data.views;
      }
      if (data.clicks > dailyRecord.sites[domain].clicks) {
        dailyRecord.sites[domain].clicks = data.clicks;
      }
    }

    // Recalculate totals
    let totalViews = 0, totalClicks = 0;
    for (const data of Object.values(dailyRecord.sites)) {
      totalViews += data.views;
      totalClicks += data.clicks;
    }
    dailyRecord.total = { views: totalViews, clicks: totalClicks };

    // Store the updated record
    await ANALYTICS_DAILY.replaceOne(
      { date: todayStr },
      dailyRecord,
      { upsert: true }
    );

  } catch (error) {
    console.error('Error in hourly analytics backup:', error);
  }
}

async function aggregateDailyAnalytics(POPUPS, ANALYTICS_DAILY, ANALYTICS_WEEKLY, ANALYTICS_MONTHLY) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
  const weekStart = getWeekStart(today);
  const monthStart = getMonthStart(today);
  
  try {
    // Get all popups with their current stats
    const popups = await POPUPS.find({}).toArray();
    
    let totalViews = 0;
    let totalClicks = 0;
    const siteData = {};

    // Process each popup
    for (const popup of popups) {
      const views = popup.views || 0;
      const clicks = popup.clicks || 0;
      totalViews += views;
      totalClicks += clicks;

      // Aggregate by domain from refery data
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

    // Store daily aggregation
    await ANALYTICS_DAILY.replaceOne(
      { date: todayStr },
      {
        date: todayStr,
        timestamp: today.getTime(),
        total: { views: totalViews, clicks: totalClicks },
        sites: siteData
      },
      { upsert: true }
    );

    // Aggregate weekly data
    const weeklyData = await aggregateWeeklyData(ANALYTICS_DAILY, weekStart);
    await ANALYTICS_WEEKLY.replaceOne(
      { weekStart: weekStart.toISOString().split('T')[0] },
      weeklyData,
      { upsert: true }
    );

    // Aggregate monthly data
    const monthlyData = await aggregateMonthlyData(ANALYTICS_DAILY, monthStart);
    await ANALYTICS_MONTHLY.replaceOne(
      { monthStart: monthStart.toISOString().split('T')[0] },
      monthlyData,
      { upsert: true }
    );

    // Clean up old data
    await cleanupOldData(ANALYTICS_DAILY, ANALYTICS_WEEKLY, ANALYTICS_MONTHLY);

    console.log('Daily analytics aggregation completed');
  } catch (error) {
    console.error('Error in daily analytics aggregation:', error);
  }
}

async function aggregateWeeklyData(ANALYTICS_DAILY, weekStart) {
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const weekStartStr = weekStart.toISOString().split('T')[0];
  const weekEndStr = weekEnd.toISOString().split('T')[0];

  const dailyData = await ANALYTICS_DAILY.find({
    date: { $gte: weekStartStr, $lt: weekEndStr }
  }).toArray();

  const aggregated = {
    weekStart: weekStartStr,
    total: { views: 0, clicks: 0 },
    sites: {}
  };

  for (const day of dailyData) {
    aggregated.total.views += day.total.views;
    aggregated.total.clicks += day.total.clicks;
    
    for (const [site, data] of Object.entries(day.sites)) {
      if (!aggregated.sites[site]) {
        aggregated.sites[site] = { views: 0, clicks: 0 };
      }
      aggregated.sites[site].views += data.views;
      aggregated.sites[site].clicks += data.clicks;
    }
  }

  return aggregated;
}

async function aggregateMonthlyData(ANALYTICS_DAILY, monthStart) {
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
  const monthStartStr = monthStart.toISOString().split('T')[0];
  const monthEndStr = monthEnd.toISOString().split('T')[0];

  const dailyData = await ANALYTICS_DAILY.find({
    date: { $gte: monthStartStr, $lt: monthEndStr }
  }).toArray();

  const aggregated = {
    monthStart: monthStartStr,
    total: { views: 0, clicks: 0 },
    sites: {}
  };

  for (const day of dailyData) {
    aggregated.total.views += day.total.views;
    aggregated.total.clicks += day.total.clicks;
    
    for (const [site, data] of Object.entries(day.sites)) {
      if (!aggregated.sites[site]) {
        aggregated.sites[site] = { views: 0, clicks: 0 };
      }
      aggregated.sites[site].views += data.views;
      aggregated.sites[site].clicks += data.clicks;
    }
  }

  return aggregated;
}

async function cleanupOldData(ANALYTICS_DAILY, ANALYTICS_WEEKLY, ANALYTICS_MONTHLY) {
  // Keep 3 months of daily data (for 2 complete periods)
  const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  // Keep 1 year of weekly data
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  // Keep 3 years of monthly data
  const threeYearsAgo = new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  await ANALYTICS_DAILY.deleteMany({ date: { $lt: threeMonthsAgo } });
  await ANALYTICS_WEEKLY.deleteMany({ weekStart: { $lt: oneYearAgo } });
  await ANALYTICS_MONTHLY.deleteMany({ monthStart: { $lt: threeYearsAgo } });
}

function getWeekStart(date) {
  const start = new Date(date);
  const day = start.getDay();
  const diff = start.getDate() - day;
  return new Date(start.setDate(diff));
}

function getMonthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

module.exports = { initializeAnalyticsCronJobs };
