/**
 * Fix Accumulated Analytics Data Script
 * 
 * This script fixes analyticsDaily data where values accumulated over time
 * instead of being daily deltas. It recalculates daily deltas by comparing
 * consecutive snapshots from analyticsSnapshots.
 * 
 * Run this after deploying the cronjob-analytics.js fix.
 * 
 * Usage: node scripts/fix-accumulated-analytics.js
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');

const url = process.env.MONGODB_URL;
const dbName = process.env.MONGODB_DATABASE;

async function fixAccumulatedAnalytics() {
  if (!url || !dbName) {
    console.error('MONGODB_URL or MONGODB_DATABASE is not set in environment.');
    process.exit(1);
  }

  let client;
  try {
    client = await MongoClient.connect(url, { useUnifiedTopology: true });
    console.log('Connected to MongoDB...');
    
    const db = client.db(dbName);
    const ANALYTICS_DAILY = db.collection('analyticsDaily');
    const ANALYTICS_SNAPSHOTS = db.collection('analyticsSnapshots');

    // Step 1: Create backup
    const backupSuffix = new Date().toISOString().replace(/[:.]/g, '-');
    const dailyBackupName = `analyticsDaily_backup_before_fix_${backupSuffix}`;
    
    console.log(`Creating backup: ${dailyBackupName}`);
    const dailyDocs = await ANALYTICS_DAILY.find({}).toArray();
    if (dailyDocs.length > 0) {
      await db.collection(dailyBackupName).insertMany(dailyDocs);
      console.log(`  Backed up ${dailyDocs.length} records`);
    }

    // Step 2: Get all snapshots sorted by date
    const allSnapshots = await ANALYTICS_SNAPSHOTS.find({}).sort({ date: 1 }).toArray();
    console.log(`\nFound ${allSnapshots.length} snapshots to process`);

    if (allSnapshots.length === 0) {
      console.log('No snapshots found. Cannot fix data without snapshots.');
      return;
    }

    // Step 3: Calculate daily deltas from snapshots
    console.log('\nRecalculating daily deltas from snapshots...\n');
    
    let fixedCount = 0;
    let skippedCount = 0;
    
    for (let i = 0; i < allSnapshots.length; i++) {
      const currentSnapshot = allSnapshots[i];
      const prevSnapshot = i > 0 ? allSnapshots[i - 1] : { total: { views: 0, clicks: 0 }, sites: {} };
      
      const currentDate = currentSnapshot.date;
      
      // Calculate daily delta: current cumulative - previous cumulative
      const dailyViews = Math.max(0, (currentSnapshot.total?.views || 0) - (prevSnapshot.total?.views || 0));
      const dailyClicks = Math.max(0, (currentSnapshot.total?.clicks || 0) - (prevSnapshot.total?.clicks || 0));
      
      // Calculate per-site deltas
      const dailySites = {};
      const allDomains = new Set([
        ...Object.keys(prevSnapshot.sites || {}),
        ...Object.keys(currentSnapshot.sites || {})
      ]);
      
      for (const domain of allDomains) {
        const currentSite = (currentSnapshot.sites && currentSnapshot.sites[domain]) || { views: 0, clicks: 0 };
        const prevSite = (prevSnapshot.sites && prevSnapshot.sites[domain]) || { views: 0, clicks: 0 };
        
        const siteDailyViews = Math.max(0, (currentSite.views || 0) - (prevSite.views || 0));
        const siteDailyClicks = Math.max(0, (currentSite.clicks || 0) - (prevSite.clicks || 0));
        
        if (siteDailyViews > 0 || siteDailyClicks > 0) {
          dailySites[domain] = { views: siteDailyViews, clicks: siteDailyClicks };
        }
      }
      
      // Find existing daily record to get timestamp
      const existingDaily = await ANALYTICS_DAILY.findOne({ date: currentDate });
      const timestamp = existingDaily?.timestamp || new Date(currentDate).getTime();
      
      // Update daily record with delta values
      if (dailyViews > 0 || dailyClicks > 0 || Object.keys(dailySites).length > 0) {
        await ANALYTICS_DAILY.replaceOne(
          { date: currentDate },
          {
            date: currentDate,
            timestamp: timestamp,
            total: { views: dailyViews, clicks: dailyClicks },
            sites: dailySites,
            fixedFromAccumulation: true,
            fixedAt: new Date()
          },
          { upsert: true }
        );
        
        console.log(`Fixed ${currentDate}: ${dailyViews} views, ${dailyClicks} clicks (was: ${existingDaily?.total?.views || 0} views)`);
        fixedCount++;
      } else {
        // If no activity, still update to ensure record exists with zeros
        await ANALYTICS_DAILY.replaceOne(
          { date: currentDate },
          {
            date: currentDate,
            timestamp: timestamp,
            total: { views: 0, clicks: 0 },
            sites: {},
            fixedFromAccumulation: true,
            fixedAt: new Date()
          },
          { upsert: true }
        );
        skippedCount++;
      }
    }

    // Step 4: Summary
    console.log('\n=== Summary ===');
    console.log(`Fixed ${fixedCount} daily records`);
    console.log(`Updated ${skippedCount} records with zero activity`);
    console.log(`Backup created: ${dailyBackupName}`);
    console.log('\n✅ Fix complete!');
    console.log('\nNote: The first day\'s data will show the total accumulated up to that point,');
    console.log('but all subsequent days should now show proper daily deltas.');
    
  } catch (error) {
    console.error('Error during fix:', error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
    }
  }
}

// Run the fix
fixAccumulatedAnalytics()
  .then(() => {
    console.log('\nScript completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
  });
