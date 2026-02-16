/**
 * Fix January 28th Analytics Data
 * 
 * This script specifically checks and fixes January 28th data which has
 * an anomalous peak that doesn't match the pattern of other dates.
 * 
 * Usage: node scripts/fix-january-28.js
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');

const url = process.env.MONGODB_URL;
const dbName = process.env.MONGODB_DATABASE;

const TARGET_DATE = '2025-01-28';

async function fixJanuary28() {
  if (!url || !dbName) {
    console.error('MONGODB_URL or MONGODB_DATABASE is not set in environment.');
    process.exit(1);
  }

  let client;
  try {
    client = await MongoClient.connect(url, { useUnifiedTopology: true });
    console.log('Connected to MongoDB...\n');
    
    const db = client.db(dbName);
    const ANALYTICS_DAILY = db.collection('analyticsDaily');
    const ANALYTICS_SNAPSHOTS = db.collection('analyticsSnapshots');

    // Step 1: Get January 28th data
    console.log(`=== Checking ${TARGET_DATE} ===\n`);
    
    const jan28Daily = await ANALYTICS_DAILY.findOne({ date: TARGET_DATE });
    const jan28Snapshot = await ANALYTICS_SNAPSHOTS.findOne({ date: TARGET_DATE });
    
    // Get surrounding dates for comparison
    const jan27Daily = await ANALYTICS_DAILY.findOne({ date: '2025-01-27' });
    const jan29Daily = await ANALYTICS_DAILY.findOne({ date: '2025-01-29' });
    const jan27Snapshot = await ANALYTICS_SNAPSHOTS.findOne({ date: '2025-01-27' });
    const jan29Snapshot = await ANALYTICS_SNAPSHOTS.findOne({ date: '2025-01-29' });

    console.log('January 27:');
    console.log(`  Daily: ${jan27Daily?.total?.views || 0} views, ${jan27Daily?.total?.clicks || 0} clicks`);
    console.log(`  Snapshot: ${jan27Snapshot?.total?.views || 0} views`);
    
    console.log('\nJanuary 28 (TARGET):');
    console.log(`  Daily: ${jan28Daily?.total?.views || 0} views, ${jan28Daily?.total?.clicks || 0} clicks`);
    console.log(`  Snapshot: ${jan28Snapshot?.total?.views || 0} views`);
    console.log(`  Sites:`, Object.keys(jan28Daily?.sites || {}));
    
    console.log('\nJanuary 29:');
    console.log(`  Daily: ${jan29Daily?.total?.views || 0} views, ${jan29Daily?.total?.clicks || 0} clicks`);
    console.log(`  Snapshot: ${jan29Snapshot?.total?.views || 0} views`);

    // Step 2: Analyze the issue
    console.log('\n=== Analysis ===\n');
    
    if (!jan28Daily) {
      console.log('ERROR: No daily record found for January 28th');
      return;
    }

    // Check if Jan 28 daily value is way higher than surrounding days
    const jan27Views = jan27Daily?.total?.views || 0;
    const jan28Views = jan28Daily?.total?.views || 0;
    const jan29Views = jan29Daily?.total?.views || 0;
    
    const avgSurrounding = (jan27Views + jan29Views) / 2;
    const ratio = jan28Views / (avgSurrounding || 1);
    
    console.log(`January 28 views: ${jan28Views}`);
    console.log(`Average of Jan 27 & 29: ${avgSurrounding.toFixed(0)}`);
    console.log(`Ratio: ${ratio.toFixed(2)}x`);
    
    // Check if it's truly a daily delta or cumulative
    if (jan27Snapshot && jan28Snapshot) {
      const expectedDaily = (jan28Snapshot.total?.views || 0) - (jan27Snapshot.total?.views || 0);
      const actualDaily = jan28Daily.total?.views || 0;
      
      console.log(`\nExpected daily (from snapshots): ${expectedDaily}`);
      console.log(`Actual daily (stored): ${actualDaily}`);
      console.log(`Difference: ${actualDaily - expectedDaily}`);
      
      if (Math.abs(actualDaily - expectedDaily) > 1000) {
        console.log('\n⚠️  LARGE DISCREPANCY DETECTED!');
        console.log('The stored daily value does not match the snapshot delta.');
      }
    }

    // Step 3: Show per-site breakdown
    console.log('\n=== Per-Site Breakdown for Jan 28 ===\n');
    const sites = jan28Daily.sites || {};
    const sortedSites = Object.entries(sites).sort((a, b) => (b[1].views || 0) - (a[1].views || 0));
    
    for (const [domain, data] of sortedSites.slice(0, 10)) {
      console.log(`  ${domain}: ${data.views || 0} views, ${data.clicks || 0} clicks`);
    }
    
    if (sortedSites.length > 10) {
      console.log(`  ... and ${sortedSites.length - 10} more sites`);
    }

    // Step 4: Determine what the correct value should be
    console.log('\n=== Calculating Correct Value ===\n');
    
    let correctDailyViews = jan28Views;
    let correctDailyClicks = jan28Daily?.total?.clicks || 0;
    
    if (jan27Snapshot && jan28Snapshot) {
      // Calculate what the daily should be from snapshot delta
      correctDailyViews = Math.max(0, (jan28Snapshot.total?.views || 0) - (jan27Snapshot.total?.views || 0));
      correctDailyClicks = Math.max(0, (jan28Snapshot.total?.clicks || 0) - (jan27Snapshot.total?.clicks || 0));
      
      console.log(`Correct daily from snapshots: ${correctDailyViews} views, ${correctDailyClicks} clicks`);
    } else {
      console.log('Missing snapshots - using interpolation from surrounding days');
      correctDailyViews = Math.round(avgSurrounding);
      correctDailyClicks = Math.round(((jan27Daily?.total?.clicks || 0) + (jan29Daily?.total?.clicks || 0)) / 2);
      console.log(`Interpolated: ${correctDailyViews} views, ${correctDailyClicks} clicks`);
    }

    // Step 5: Fix if needed
    if (jan28Views > correctDailyViews * 1.5) {
      console.log(`\n⚠️  January 28th appears to be incorrect!`);
      console.log(`Stored: ${jan28Views}, Should be: ~${correctDailyViews}`);
      
      // Calculate site proportions from current data
      const totalSiteViews = Object.values(sites).reduce((sum, s) => sum + (s.views || 0), 0);
      const siteProportions = {};
      
      if (totalSiteViews > 0) {
        for (const [domain, data] of Object.entries(sites)) {
          siteProportions[domain] = (data.views || 0) / totalSiteViews;
        }
      }
      
      // Recalculate per-site values
      const correctedSites = {};
      for (const [domain, prop] of Object.entries(siteProportions)) {
        const correctedViews = Math.round(correctDailyViews * prop);
        const correctedClicks = Math.round(correctDailyClicks * prop);
        
        if (correctedViews > 0 || correctedClicks > 0) {
          correctedSites[domain] = {
            views: correctedViews,
            clicks: correctedClicks
          };
        }
      }
      
      console.log('\n=== Applying Fix ===\n');
      
      // Backup before fixing
      const backupName = `analyticsDaily_backup_jan28_fix_${Date.now()}`;
      await db.collection(backupName).insertOne({ ...jan28Daily, backedUpAt: new Date() });
      console.log(`Backed up to: ${backupName}`);
      
      // Update the daily record
      await ANALYTICS_DAILY.updateOne(
        { date: TARGET_DATE },
        {
          $set: {
            total: { views: correctDailyViews, clicks: correctDailyClicks },
            sites: correctedSites,
            jan28Fixed: true,
            fixedAt: new Date(),
            previousViews: jan28Views,
            previousClicks: jan28Daily?.total?.clicks || 0
          }
        }
      );
      
      console.log(`✅ Fixed ${TARGET_DATE}:`);
      console.log(`  Was: ${jan28Views} views`);
      console.log(`  Now: ${correctDailyViews} views`);
      console.log(`  Across ${Object.keys(correctedSites).length} sites`);
      
    } else {
      console.log(`\n✅ January 28th looks correct (${jan28Views} views)`);
      console.log('No fix needed.');
    }

    // Step 6: Show final state
    const finalJan28 = await ANALYTICS_DAILY.findOne({ date: TARGET_DATE });
    console.log('\n=== Final State ===');
    console.log(`January 28: ${finalJan28?.total?.views || 0} views`);
    
    // Also show surrounding days for context
    const allDates = await ANALYTICS_DAILY.find({
      date: { $gte: '2025-01-25', $lte: '2025-01-31' }
    }).sort({ date: 1 }).toArray();
    
    console.log('\nContext (Jan 25-31):');
    for (const day of allDates) {
      const marker = day.date === TARGET_DATE ? ' <-- TARGET' : '';
      console.log(`  ${day.date}: ${day.total?.views || 0} views${marker}`);
    }
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
    }
  }
}

fixJanuary28()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Failed:', error);
    process.exit(1);
  });
