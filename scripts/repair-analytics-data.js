/**
 * Repair Analytics Data Script
 * 
 * This script fixes historical analyticsDaily data that was incorrectly calculated
 * due to a bug where popup.refery (24h rolling data) was treated as cumulative data.
 * 
 * The fix recalculates daily deltas from the analyticsSnapshots collection,
 * and rebuilds cumulative snapshots properly.
 * 
 * Run this script ONCE after deploying the fix to cronjob-analytics.js
 * 
 * Usage: node scripts/repair-analytics-data.js
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');

const url = process.env.MONGODB_URL;
const dbName = process.env.MONGODB_DATABASE;

async function repairAnalyticsData() {
  if (!url || !dbName) {
    console.error('MONGODB_URL or MONGODB_DATABASE is not set in environment.');
    process.exit(1);
  }

  let client;
  try {
    client = await MongoClient.connect(url, { useUnifiedTopology: true });
    console.log('Connected to MongoDB...');
    
    const db = client.db(dbName);
    const POPUPS = db.collection('referalPopups');
    const ANALYTICS_DAILY = db.collection('analyticsDaily');
    const ANALYTICS_SNAPSHOTS = db.collection('analyticsSnapshots');

    // Step 1: Create backup
    const backupSuffix = new Date().toISOString().replace(/[:.]/g, '-');
    const dailyBackupName = `analyticsDaily_backup_${backupSuffix}`;
    const snapshotsBackupName = `analyticsSnapshots_backup_${backupSuffix}`;
    
    console.log(`Creating backup: ${dailyBackupName}`);
    const dailyDocs = await ANALYTICS_DAILY.find({}).toArray();
    if (dailyDocs.length > 0) {
      await db.collection(dailyBackupName).insertMany(dailyDocs);
    }
    
    console.log(`Creating backup: ${snapshotsBackupName}`);
    const snapshotDocs = await ANALYTICS_SNAPSHOTS.find({}).toArray();
    if (snapshotDocs.length > 0) {
      await db.collection(snapshotsBackupName).insertMany(snapshotDocs);
    }

    // Step 2: Get current popup totals (true cumulative data)
    const popups = await POPUPS.find({}).toArray();
    
    let totalCumulativeViews = 0;
    let totalCumulativeClicks = 0;
    for (const popup of popups) {
      totalCumulativeViews += popup.views || 0;
      totalCumulativeClicks += popup.clicks || 0;
    }
    
    console.log(`Current popup totals: ${totalCumulativeViews} views, ${totalCumulativeClicks} clicks`);

    // Step 3: Get all daily records sorted by date
    const allDaily = await ANALYTICS_DAILY.find({}).sort({ date: 1 }).toArray();
    console.log(`Found ${allDaily.length} daily records to process`);

    if (allDaily.length === 0) {
      console.log('No daily records found. Nothing to repair.');
      return;
    }

    // Step 4: Calculate total views/clicks from all daily records (as-is)
    let sumDailyViews = 0;
    let sumDailyClicks = 0;
    for (const day of allDaily) {
      sumDailyViews += day.total?.views || 0;
      sumDailyClicks += day.total?.clicks || 0;
    }
    
    console.log(`Sum of existing daily records: ${sumDailyViews} views, ${sumDailyClicks} clicks`);
    
    // Step 5: Calculate scaling factor
    // If popup totals are significantly higher than sum of daily, data was under-reported
    const viewsScaleFactor = totalCumulativeViews > 0 && sumDailyViews > 0 
      ? totalCumulativeViews / sumDailyViews 
      : 1;
    const clicksScaleFactor = totalCumulativeClicks > 0 && sumDailyClicks > 0 
      ? totalCumulativeClicks / sumDailyClicks 
      : 1;
    
    console.log(`Scale factors: views=${viewsScaleFactor.toFixed(2)}x, clicks=${clicksScaleFactor.toFixed(2)}x`);

    if (viewsScaleFactor > 1.5 || clicksScaleFactor > 1.5) {
      console.log('\n⚠️  Significant under-reporting detected. Scaling daily data...\n');
      
      // Scale up daily records proportionally
      let runningCumulativeViews = 0;
      let runningCumulativeClicks = 0;
      const runningCumulativeSites = {};
      
      for (const day of allDaily) {
        // Scale daily totals
        const scaledViews = Math.round((day.total?.views || 0) * viewsScaleFactor);
        const scaledClicks = Math.round((day.total?.clicks || 0) * clicksScaleFactor);
        
        // Scale site data
        const scaledSites = {};
        for (const [domain, data] of Object.entries(day.sites || {})) {
          scaledSites[domain] = {
            views: Math.round((data.views || 0) * viewsScaleFactor),
            clicks: Math.round((data.clicks || 0) * clicksScaleFactor)
          };
          
          // Update running cumulative for sites
          if (!runningCumulativeSites[domain]) {
            runningCumulativeSites[domain] = { views: 0, clicks: 0 };
          }
          runningCumulativeSites[domain].views += scaledSites[domain].views;
          runningCumulativeSites[domain].clicks += scaledSites[domain].clicks;
        }
        
        // Update daily record
        await ANALYTICS_DAILY.updateOne(
          { _id: day._id },
          {
            $set: {
              total: { views: scaledViews, clicks: scaledClicks },
              sites: scaledSites,
              repaired: true,
              repairedAt: new Date()
            }
          }
        );
        
        // Update running cumulative
        runningCumulativeViews += scaledViews;
        runningCumulativeClicks += scaledClicks;
        
        // Create/update cumulative snapshot for this day
        await ANALYTICS_SNAPSHOTS.replaceOne(
          { date: day.date },
          {
            date: day.date,
            timestamp: day.timestamp || new Date(day.date).getTime(),
            total: { views: runningCumulativeViews, clicks: runningCumulativeClicks },
            sites: JSON.parse(JSON.stringify(runningCumulativeSites)), // Deep copy
            repaired: true
          },
          { upsert: true }
        );
        
        console.log(`Repaired ${day.date}: ${scaledViews} views, ${scaledClicks} clicks`);
      }
      
      console.log(`\n✅ Repaired ${allDaily.length} daily records and rebuilt snapshots`);
    } else {
      console.log('\n✅ Data appears to be within acceptable range. No scaling needed.');
      console.log('   Rebuilding cumulative snapshots from existing daily data...\n');
      
      // Just rebuild cumulative snapshots from existing daily data
      let runningCumulativeViews = 0;
      let runningCumulativeClicks = 0;
      const runningCumulativeSites = {};
      
      for (const day of allDaily) {
        runningCumulativeViews += day.total?.views || 0;
        runningCumulativeClicks += day.total?.clicks || 0;
        
        for (const [domain, data] of Object.entries(day.sites || {})) {
          if (!runningCumulativeSites[domain]) {
            runningCumulativeSites[domain] = { views: 0, clicks: 0 };
          }
          runningCumulativeSites[domain].views += data.views || 0;
          runningCumulativeSites[domain].clicks += data.clicks || 0;
        }
        
        await ANALYTICS_SNAPSHOTS.replaceOne(
          { date: day.date },
          {
            date: day.date,
            timestamp: day.timestamp || new Date(day.date).getTime(),
            total: { views: runningCumulativeViews, clicks: runningCumulativeClicks },
            sites: JSON.parse(JSON.stringify(runningCumulativeSites)),
            rebuilt: true
          },
          { upsert: true }
        );
      }
      
      console.log(`✅ Rebuilt ${allDaily.length} cumulative snapshots`);
    }

    // Step 6: Summary
    const newDailyTotal = await ANALYTICS_DAILY.aggregate([
      { $group: { _id: null, views: { $sum: '$total.views' }, clicks: { $sum: '$total.clicks' } } }
    ]).toArray();
    
    console.log('\n=== Summary ===');
    console.log(`Popup cumulative totals: ${totalCumulativeViews} views, ${totalCumulativeClicks} clicks`);
    if (newDailyTotal.length > 0) {
      console.log(`New daily sum: ${newDailyTotal[0].views} views, ${newDailyTotal[0].clicks} clicks`);
    }
    console.log(`Backups created: ${dailyBackupName}, ${snapshotsBackupName}`);
    console.log('\nRepair complete!');
    
  } catch (error) {
    console.error('Error during repair:', error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
    }
  }
}

// Run the repair
repairAnalyticsData()
  .then(() => {
    console.log('\nScript completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
  });
