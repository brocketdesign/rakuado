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

  console.log('Analytics cron jobs initialized');
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
  const sevenDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const oneMonthAgo = new Date(Date.now() - 32 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const oneYearAgo = new Date(Date.now() - 366 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  await ANALYTICS_DAILY.deleteMany({ date: { $lt: sevenDaysAgo } });
  await ANALYTICS_WEEKLY.deleteMany({ weekStart: { $lt: oneMonthAgo } });
  await ANALYTICS_MONTHLY.deleteMany({ monthStart: { $lt: oneYearAgo } });
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
