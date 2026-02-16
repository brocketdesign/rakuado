const cron = require('node-cron');

// Helper to filter refery array to last 24 hours
const filterRecentRefery = (refery) => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return (refery || []).filter(r => r.timestamp && r.timestamp >= cutoff);
};

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
// Stores the current cumulative state from popup counters for accurate daily delta calculations
async function backupCurrentAnalytics(POPUPS, ANALYTICS_SNAPSHOTS) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  try {
    // Get current popup data
    const popups = await POPUPS.find({}).toArray();
    
    // Use popup-level cumulative counters for totals
    // These counters increment permanently and never reset
    let totalViews = 0;
    let totalClicks = 0;
    for (const popup of popups) {
      totalViews += popup.views || 0;
      totalClicks += popup.clicks || 0;
    }
    
    // IMPORTANT: For per-site data, we do NOT accumulate in the hourly backup.
    // The refery array contains a rolling 24h window of activity.
    // If we accumulate this every hour, we get massive over-counting.
    // Instead, we capture the CURRENT 24h activity as "today's snapshot".
    // The daily aggregation will calculate the delta from this.
    const todaySiteData = {};
    for (const popup of popups) {
      const refery = filterRecentRefery(popup.refery);
      for (const ref of refery) {
        const domain = ref.domain || 'unknown';
        if (!todaySiteData[domain]) {
          todaySiteData[domain] = { views: 0, clicks: 0 };
        }
        todaySiteData[domain].views += ref.view || 0;
        todaySiteData[domain].clicks += ref.click || 0;
      }
    }
    
    // Get yesterday's snapshot to calculate proper cumulative per-site data
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const prevSnapshot = await ANALYTICS_SNAPSHOTS.findOne({ date: yesterdayStr }) || { sites: {} };
    
    // Calculate cumulative per-site: yesterday's cumulative + today's activity
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
      const refery = filterRecentRefery(popup.refery);
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

    // IMPORTANT: Daily delta should be calculated as the DIFFERENCE between snapshots
    // The hourly backup creates cumulative snapshots by adding daily activity.
    // So daily activity = today's cumulative snapshot - yesterday's cumulative snapshot
    // This is more accurate than using raw refery data which may span 24h across day boundaries
    
    // First, get or build today's cumulative snapshot
    const existingTodaySnapshot = await ANALYTICS_SNAPSHOTS.findOne({ date: todayStr });
    const todaySnapshot = existingTodaySnapshot || {
      date: todayStr,
      total: { views: totalViews, clicks: totalClicks },
      sites: cumulativeSites
    };
    
    // Calculate daily delta by subtracting yesterday's cumulative from today's cumulative
    const dailyTotalViews = Math.max(0, (todaySnapshot.total.views || 0) - (prevSnapshot.total.views || 0));
    const dailyTotalClicks = Math.max(0, (todaySnapshot.total.clicks || 0) - (prevSnapshot.total.clicks || 0));
    
    // Calculate per-site daily deltas
    const dailySites = {};
    const allCumulativeDomains = new Set([
      ...Object.keys(prevSnapshot.sites || {}),
      ...Object.keys(todaySnapshot.sites || {})
    ]);
    
    for (const domain of allCumulativeDomains) {
      const todaySite = (todaySnapshot.sites && todaySnapshot.sites[domain]) || { views: 0, clicks: 0 };
      const prevSite = (prevSnapshot.sites && prevSnapshot.sites[domain]) || { views: 0, clicks: 0 };
      
      const dailyViews = Math.max(0, (todaySite.views || 0) - (prevSite.views || 0));
      const dailyClicks = Math.max(0, (todaySite.clicks || 0) - (prevSite.clicks || 0));
      
      if (dailyViews > 0 || dailyClicks > 0) {
        dailySites[domain] = { views: dailyViews, clicks: dailyClicks };
      }
    }

    // Store daily (delta) aggregation into analyticsDaily
    // NOTE: We store this under yesterday's date since we're calculating the delta 
    // that happened DURING yesterday (the period between yesterday's snapshot and today's snapshot)
    await ANALYTICS_DAILY.replaceOne(
      { date: yesterdayStr },
      {
        date: yesterdayStr,
        timestamp: yesterday.getTime(),
        total: { views: dailyTotalViews, clicks: dailyTotalClicks },
        sites: dailySites
      },
      { upsert: true }
    );

    // Store the cumulative snapshot for today (used for next day's calculations)
    const finalSnapshot = {
      date: todayStr,
      timestamp: today.getTime(),
      total: { views: totalViews, clicks: totalClicks },
      sites: cumulativeSites
    };

    await ANALYTICS_SNAPSHOTS.replaceOne({ date: todayStr }, finalSnapshot, { upsert: true });

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
