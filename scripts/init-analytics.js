require('dotenv').config();
const { MongoClient } = require('mongodb');

const url = process.env.MONGODB_URL;
const dbName = process.env.MONGODB_DATABASE;

async function initializeAnalyticsData() {
  const client = await MongoClient.connect(url, { useUnifiedTopology: true });
  console.log('Connected to MongoDB...');
  
  const db = client.db(dbName);
  const POPUPS = db.collection('referalPopups');
  const ANALYTICS_DAILY = db.collection('analyticsDaily');
  const ANALYTICS_WEEKLY = db.collection('analyticsWeekly');
  const ANALYTICS_MONTHLY = db.collection('analyticsMonthly');

  try {
    console.log('Initializing analytics data...');
    
    // Generate historical data for the last 7 days
    const today = new Date();
    const historicalDays = [];
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
      historicalDays.push(date);
    }

    // Get current popup data
    const popups = await POPUPS.find({}).toArray();
    console.log(`Found ${popups.length} popups`);

    let totalViews = 0;
    let totalClicks = 0;
    const siteData = {};

    // Aggregate current data from popups
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

    console.log(`Total current stats: ${totalViews} views, ${totalClicks} clicks`);
    console.log(`Sites found: ${Object.keys(siteData).join(', ')}`);

    // Create sample historical data (distribute current data across last 7 days)
    for (let i = 0; i < historicalDays.length; i++) {
      const date = historicalDays[i];
      const dateStr = date.toISOString().split('T')[0];
      
      // Distribute data with some variation (more recent days have more activity)
      const dayWeight = (i + 1) / historicalDays.length;
      const randomFactor = 0.5 + Math.random() * 0.5; // 0.5 to 1.0
      const dayViews = Math.floor(totalViews * dayWeight * randomFactor / 7);
      const dayClicks = Math.floor(totalClicks * dayWeight * randomFactor / 7);

      // Distribute site data proportionally
      const daySiteData = {};
      for (const [site, data] of Object.entries(siteData)) {
        daySiteData[site] = {
          views: Math.floor(data.views * dayWeight * randomFactor / 7),
          clicks: Math.floor(data.clicks * dayWeight * randomFactor / 7)
        };
      }

      await ANALYTICS_DAILY.replaceOne(
        { date: dateStr },
        {
          date: dateStr,
          timestamp: date.getTime(),
          total: { views: dayViews, clicks: dayClicks },
          sites: daySiteData
        },
        { upsert: true }
      );

      console.log(`Created daily data for ${dateStr}: ${dayViews} views, ${dayClicks} clicks`);
    }

    // Generate weekly data
    const weekStart = getWeekStart(today);
    const weeklyData = await aggregateWeeklyData(ANALYTICS_DAILY, weekStart);
    await ANALYTICS_WEEKLY.replaceOne(
      { weekStart: weekStart.toISOString().split('T')[0] },
      weeklyData,
      { upsert: true }
    );
    console.log('Created weekly aggregation');

    // Generate monthly data
    const monthStart = getMonthStart(today);
    const monthlyData = await aggregateMonthlyData(ANALYTICS_DAILY, monthStart);
    await ANALYTICS_MONTHLY.replaceOne(
      { monthStart: monthStart.toISOString().split('T')[0] },
      monthlyData,
      { upsert: true }
    );
    console.log('Created monthly aggregation');

    console.log('Analytics initialization completed successfully!');
    
  } catch (error) {
    console.error('Error initializing analytics:', error);
  } finally {
    await client.close();
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
    
    for (const [site, data] of Object.entries(day.sites || {})) {
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
    
    for (const [site, data] of Object.entries(day.sites || {})) {
      if (!aggregated.sites[site]) {
        aggregated.sites[site] = { views: 0, clicks: 0 };
      }
      aggregated.sites[site].views += data.views;
      aggregated.sites[site].clicks += data.clicks;
    }
  }

  return aggregated;
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

// Run the initialization
initializeAnalyticsData()
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
  });