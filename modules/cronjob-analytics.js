const cron = require('node-cron');

function initializeAnalyticsCronJobs(db) {
  const POPUPS = db.collection('referalPopups');
  const ANALYTICS_DAILY = db.collection('analyticsDaily');
  const ANALYTICS_WEEKLY = db.collection('analyticsWeekly');
  const ANALYTICS_MONTHLY = db.collection('analyticsMonthly');
  const ANALYTICS_SNAPSHOTS = db.collection('analyticsSnapshots');

  // Run daily at 00:01
  cron.schedule('1 0 * * *', async () => {
    console.log('Running daily analytics aggregation...');
    await aggregateDailyAnalytics(POPUPS, ANALYTICS_DAILY, ANALYTICS_WEEKLY, ANALYTICS_MONTHLY, ANALYTICS_SNAPSHOTS);
  });

  // Run hourly backup to ensure data preservation
  cron.schedule('0 * * * *', async () => {
    console.log('Running hourly analytics backup...');
    await backupCurrentAnalytics(POPUPS, ANALYTICS_SNAPSHOTS);
  });

  console.log('Analytics cron jobs initialized');
}

// Backup current analytics data every hour to prevent data loss
// NOTE: popup.refery contains only ~24h rolling data, so we use popup-level 
// cumulative counters (views, clicks) for totals, and treat refery as today's activity
async function backupCurrentAnalytics(POPUPS, ANALYTICS_SNAPSHOTS) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  try {
    // Get yesterday's cumulative snapshot as the baseline
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const prevSnapshot = await ANALYTICS_SNAPSHOTS.findOne({ date: yesterdayStr }) || { total: { views: 0, clicks: 0 }, sites: {} };
    
    // Get current popup data
    const popups = await POPUPS.find({}).toArray();
    
    // Use popup-level cumulative counters for accurate totals
    let totalViews = 0;
    let totalClicks = 0;
    for (const popup of popups) {
      totalViews += popup.views || 0;
      totalClicks += popup.clicks || 0;
    }
    
    // For per-site data, we need to build cumulative from previous snapshot + today's refery
    // refery contains ~24h rolling data which represents today's activity
    const todaySiteData = {};
    for (const popup of popups) {
      const refery = popup.refery || [];
      for (const ref of refery) {
        const domain = ref.domain || 'unknown';
        if (!todaySiteData[domain]) {
          todaySiteData[domain] = { views: 0, clicks: 0 };
        }
        todaySiteData[domain].views += ref.view || 0;
        todaySiteData[domain].clicks += ref.click || 0;
      }
    }
    
    // Build cumulative site data: previous cumulative + today's activity
    // But we need to avoid double-counting if snapshot was already updated today
    const existingTodaySnapshot = await ANALYTICS_SNAPSHOTS.findOne({ date: todayStr });
    
    const cumulativeSites = {};
    const allDomains = new Set([
      ...Object.keys(prevSnapshot.sites || {}),
      ...Object.keys(todaySiteData)
    ]);
    
    for (const domain of allDomains) {
      const prevSiteData = (prevSnapshot.sites && prevSnapshot.sites[domain]) || { views: 0, clicks: 0 };
      const todayActivity = todaySiteData[domain] || { views: 0, clicks: 0 };
      
      // Cumulative = yesterday's cumulative + today's activity
      cumulativeSites[domain] = {
        views: (prevSiteData.views || 0) + (todayActivity.views || 0),
        clicks: (prevSiteData.clicks || 0) + (todayActivity.clicks || 0)
      };
    }

    const snapshot = {
      date: todayStr,
      timestamp: today.getTime(),
      total: { views: totalViews, clicks: totalClicks },
      sites: cumulativeSites
    };

    // Store cumulative snapshot for today (used later to compute daily deltas)
    await ANALYTICS_SNAPSHOTS.replaceOne(
      { date: todayStr },
      snapshot,
      { upsert: true }
    );

  } catch (error) {
    console.error('Error in hourly analytics backup:', error);
  }
}

async function aggregateDailyAnalytics(POPUPS, ANALYTICS_DAILY, ANALYTICS_WEEKLY, ANALYTICS_MONTHLY, ANALYTICS_SNAPSHOTS) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
  const weekStart = getWeekStart(today);
  const monthStart = getMonthStart(today);
  
  try {
    // Get yesterday's cumulative snapshot as baseline
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const prevSnapshot = await ANALYTICS_SNAPSHOTS.findOne({ date: yesterdayStr }) || { total: { views: 0, clicks: 0 }, sites: {} };

    // Get current popup data
    const popups = await POPUPS.find({}).toArray();
    
    // Use popup-level cumulative counters for accurate totals
    let totalViews = 0;
    let totalClicks = 0;
    for (const popup of popups) {
      totalViews += popup.views || 0;
      totalClicks += popup.clicks || 0;
    }
    
    // For per-site data, refery contains ~24h rolling data (today's activity)
    const todaySiteActivity = {};
    for (const popup of popups) {
      const refery = popup.refery || [];
      for (const ref of refery) {
        const domain = ref.domain || 'unknown';
        if (!todaySiteActivity[domain]) {
          todaySiteActivity[domain] = { views: 0, clicks: 0 };
        }
        todaySiteActivity[domain].views += ref.view || 0;
        todaySiteActivity[domain].clicks += ref.click || 0;
      }
    }
    
    // Build cumulative site data: previous cumulative + today's activity
    const cumulativeSites = {};
    const allDomains = new Set([
      ...Object.keys(prevSnapshot.sites || {}),
      ...Object.keys(todaySiteActivity)
    ]);
    
    for (const domain of allDomains) {
      const prevSiteData = (prevSnapshot.sites && prevSnapshot.sites[domain]) || { views: 0, clicks: 0 };
      const todayActivity = todaySiteActivity[domain] || { views: 0, clicks: 0 };
      
      cumulativeSites[domain] = {
        views: (prevSiteData.views || 0) + (todayActivity.views || 0),
        clicks: (prevSiteData.clicks || 0) + (todayActivity.clicks || 0)
      };
    }

    // Daily delta = today's activity from refery (which is already ~24h data)
    // This is the correct approach since refery represents today's incremental activity
    const dailySites = {};
    for (const domain of Object.keys(todaySiteActivity)) {
      const activity = todaySiteActivity[domain];
      if ((activity.views || 0) > 0 || (activity.clicks || 0) > 0) {
        dailySites[domain] = {
          views: activity.views || 0,
          clicks: activity.clicks || 0
        };
      }
    }

    // Calculate daily totals from refery data
    let dailyTotalViews = 0;
    let dailyTotalClicks = 0;
    for (const data of Object.values(todaySiteActivity)) {
      dailyTotalViews += data.views || 0;
      dailyTotalClicks += data.clicks || 0;
    }

    // Store daily (delta) aggregation into analyticsDaily
    await ANALYTICS_DAILY.replaceOne(
      { date: todayStr },
      {
        date: todayStr,
        timestamp: today.getTime(),
        total: { views: dailyTotalViews, clicks: dailyTotalClicks },
        sites: dailySites
      },
      { upsert: true }
    );

    // Store the cumulative snapshot for today (used for next day's calculations)
    const todaySnapshot = {
      date: todayStr,
      timestamp: today.getTime(),
      total: { views: totalViews, clicks: totalClicks },
      sites: cumulativeSites
    };

    await ANALYTICS_SNAPSHOTS.replaceOne({ date: todayStr }, todaySnapshot, { upsert: true });

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
    await cleanupOldData(ANALYTICS_DAILY, ANALYTICS_WEEKLY, ANALYTICS_MONTHLY, ANALYTICS_SNAPSHOTS);

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

async function cleanupOldData(ANALYTICS_DAILY, ANALYTICS_WEEKLY, ANALYTICS_MONTHLY, ANALYTICS_SNAPSHOTS) {
  // Keep 3 months of daily data (for 2 complete periods)
  const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  // Keep 1 year of weekly data
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  // Keep 3 years of monthly data
  const threeYearsAgo = new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  await ANALYTICS_DAILY.deleteMany({ date: { $lt: threeMonthsAgo } });
  await ANALYTICS_WEEKLY.deleteMany({ weekStart: { $lt: oneYearAgo } });
  await ANALYTICS_MONTHLY.deleteMany({ monthStart: { $lt: threeYearsAgo } });

  // Also clean up old cumulative snapshots (we keep the same retention as daily)
  if (ANALYTICS_SNAPSHOTS) {
    await ANALYTICS_SNAPSHOTS.deleteMany({ date: { $lt: threeMonthsAgo } });
  }
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

async function runBackupNow(db) {
  const POPUPS = db.collection('referalPopups');
  const ANALYTICS_SNAPSHOTS = db.collection('analyticsSnapshots');
  await backupCurrentAnalytics(POPUPS, ANALYTICS_SNAPSHOTS);
}

async function runAggregateNow(db) {
  const POPUPS = db.collection('referalPopups');
  const ANALYTICS_DAILY = db.collection('analyticsDaily');
  const ANALYTICS_WEEKLY = db.collection('analyticsWeekly');
  const ANALYTICS_MONTHLY = db.collection('analyticsMonthly');
  const ANALYTICS_SNAPSHOTS = db.collection('analyticsSnapshots');
  await aggregateDailyAnalytics(POPUPS, ANALYTICS_DAILY, ANALYTICS_WEEKLY, ANALYTICS_MONTHLY, ANALYTICS_SNAPSHOTS);
}

module.exports = { initializeAnalyticsCronJobs, runBackupNow, runAggregateNow };
