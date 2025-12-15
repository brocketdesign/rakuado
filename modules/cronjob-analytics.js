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
async function backupCurrentAnalytics(POPUPS, ANALYTICS_SNAPSHOTS) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  try {
    // Build a cumulative snapshot from current popups and store it in snapshots collection
    const popups = await POPUPS.find({}).toArray();
    const currentSiteData = {};
    let totalViews = 0;
    let totalClicks = 0;

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

    for (const data of Object.values(currentSiteData)) {
      totalViews += data.views;
      totalClicks += data.clicks;
    }

    const snapshot = {
      date: todayStr,
      timestamp: today.getTime(),
      total: { views: totalViews, clicks: totalClicks },
      sites: currentSiteData
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
    // Build cumulative snapshot from current popups (end-of-day snapshot)
    const popups = await POPUPS.find({}).toArray();
    let cumulativeViews = 0;
    let cumulativeClicks = 0;
    const cumulativeSites = {};

    for (const popup of popups) {
      const refery = popup.refery || [];
      for (const ref of refery) {
        const domain = ref.domain || 'unknown';
        if (!cumulativeSites[domain]) {
          cumulativeSites[domain] = { views: 0, clicks: 0 };
        }
        cumulativeSites[domain].views += ref.view || 0;
        cumulativeSites[domain].clicks += ref.click || 0;
      }
    }

    for (const data of Object.values(cumulativeSites)) {
      cumulativeViews += data.views;
      cumulativeClicks += data.clicks;
    }

    // Fetch yesterday's cumulative snapshot to compute daily delta
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const prevSnapshot = await ANALYTICS_SNAPSHOTS.findOne({ date: yesterdayStr }) || { total: { views: 0, clicks: 0 }, sites: {} };

    // Compute daily (delta) values = cumulative today - cumulative yesterday
    const dailySites = {};
    const allDomains = new Set([...Object.keys(cumulativeSites), ...Object.keys(prevSnapshot.sites || {})]);

    for (const domain of allDomains) {
      const todayData = cumulativeSites[domain] || { views: 0, clicks: 0 };
      const prevData = (prevSnapshot.sites && prevSnapshot.sites[domain]) ? prevSnapshot.sites[domain] : { views: 0, clicks: 0 };
      const dViews = Math.max(0, (todayData.views || 0) - (prevData.views || 0));
      const dClicks = Math.max(0, (todayData.clicks || 0) - (prevData.clicks || 0));
      if (dViews > 0 || dClicks > 0) {
        dailySites[domain] = { views: dViews, clicks: dClicks };
      }
    }

    const dailyTotalViews = Math.max(0, cumulativeViews - (prevSnapshot.total ? prevSnapshot.total.views : 0));
    const dailyTotalClicks = Math.max(0, cumulativeClicks - (prevSnapshot.total ? prevSnapshot.total.clicks : 0));

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

    // Also store the cumulative snapshot for today (used for next day's delta)
    const todaySnapshot = {
      date: todayStr,
      timestamp: today.getTime(),
      total: { views: cumulativeViews, clicks: cumulativeClicks },
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
