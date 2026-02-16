/**
 * Fix Specific Date Analytics Data
 * 
 * This script fixes specific dates that have anomalous peaks (like Jan 28, 2026 with 311k views)
 * 
 * Usage: node scripts/fix-specific-date.js 2026-01-28
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');

const url = process.env.MONGODB_URL;
const dbName = process.env.MONGODB_DATABASE;

// Get date from command line argument, or use default
const TARGET_DATE = process.argv[2] || '2026-01-28';

async function fixSpecificDate() {
  if (!url || !dbName) {
    console.error('MONGODB_URL or MONGODB_DATABASE is not set in environment.');
    process.exit(1);
  }

  let client;
  try {
    client = await MongoClient.connect(url, { useUnifiedTopology: true });
    console.log(`Connected to MongoDB...\n`);
    console.log(`=== Fixing ${TARGET_DATE} ===\n`);
    
    const db = client.db(dbName);
    const ANALYTICS_DAILY = db.collection('analyticsDaily');
    const ANALYTICS_SNAPSHOTS = db.collection('analyticsSnapshots');

    // Get the target date data
    const targetDaily = await ANALYTICS_DAILY.findOne({ date: TARGET_DATE });
    const targetSnapshot = await ANALYTICS_SNAPSHOTS.findOne({ date: TARGET_DATE });
    
    if (!targetDaily) {
      console.log(`No daily record found for ${TARGET_DATE}`);
      return;
    }

    console.log(`Current ${TARGET_DATE} data:`);
    console.log(`  Daily: ${targetDaily.total?.views || 0} views, ${targetDaily.total?.clicks || 0} clicks`);
    console.log(`  Snapshot: ${targetSnapshot?.total?.views || 0} views`);
    console.log(`  Sites: ${Object.keys(targetDaily.sites || {}).length} sites`);

    // Get surrounding dates
    const prevDate = getPreviousDate(TARGET_DATE);
    const nextDate = getNextDate(TARGET_DATE);
    
    const prevDaily = await ANALYTICS_DAILY.findOne({ date: prevDate });
    const nextDaily = await ANALYTICS_DAILY.findOne({ date: nextDate });
    
    console.log(`\nSurrounding dates:`);
    console.log(`  ${prevDate}: ${prevDaily?.total?.views || 0} views`);
    console.log(`  ${nextDate}: ${nextDaily?.total?.views || 0} views`);

    // Calculate what the value should be
    const prevViews = prevDaily?.total?.views || 0;
    const nextViews = nextDaily?.total?.views || 0;
    const targetViews = targetDaily.total?.views || 0;
    
    // If target is way higher than neighbors, it's likely wrong
    const avgNeighbors = (prevViews + nextViews) / 2;
    const ratio = targetViews / (avgNeighbors || 1);
    
    console.log(`\nAnalysis:`);
    console.log(`  Target views: ${targetViews}`);
    console.log(`  Average of neighbors: ${avgNeighbors.toFixed(0)}`);
    console.log(`  Ratio: ${ratio.toFixed(2)}x`);
    
    if (ratio < 2) {
      console.log(`\n✅ ${TARGET_DATE} looks normal. No fix needed.`);
      return;
    }

    console.log(`\n⚠️  ${TARGET_DATE} has ${ratio.toFixed(1)}x the views of surrounding days!`);
    console.log(`This needs to be fixed.\n`);

    // Calculate corrected values
    // Use average of neighbors as the corrected daily value
    const correctedViews = Math.round(avgNeighbors);
    const correctedClicks = Math.round(((prevDaily?.total?.clicks || 0) + (nextDaily?.total?.clicks || 0)) / 2);
    
    console.log(`Calculated correction:`);
    console.log(`  Should be: ~${correctedViews} views, ~${correctedClicks} clicks`);

    // Calculate site proportions from current data
    const sites = targetDaily.sites || {};
    const totalSiteViews = Object.values(sites).reduce((sum, s) => sum + (s.views || 0), 0);
    
    const correctedSites = {};
    
    if (totalSiteViews > 0) {
      // Distribute corrected total proportionally across sites
      for (const [domain, data] of Object.entries(sites)) {
        const proportion = (data.views || 0) / totalSiteViews;
        const siteCorrectedViews = Math.round(correctedViews * proportion);
        const siteCorrectedClicks = Math.round(correctedClicks * proportion);
        
        if (siteCorrectedViews > 0 || siteCorrectedClicks > 0) {
          correctedSites[domain] = {
            views: siteCorrectedViews,
            clicks: siteCorrectedClicks
          };
        }
      }
    }

    console.log(`\n=== Applying Fix ===\n`);
    
    // Backup before fixing
    const backupName = `analyticsDaily_backup_${TARGET_DATE}_${Date.now()}`;
    await db.collection(backupName).insertOne({ 
      ...targetDaily, 
      backedUpAt: new Date(),
      backupReason: `Anomalous peak fix - was ${targetViews} views`
    });
    console.log(`Backed up to: ${backupName}`);

    // Update the daily record
    await ANALYTICS_DAILY.updateOne(
      { date: TARGET_DATE },
      {
        $set: {
          total: { views: correctedViews, clicks: correctedClicks },
          sites: correctedSites,
          anomalousPeakFixed: true,
          fixedAt: new Date(),
          previousTotal: { views: targetViews, clicks: targetDaily.total?.clicks || 0 }
        }
      }
    );

    // Also need to fix the snapshot to maintain consistency
    // The snapshot cumulative should be: previous snapshot + corrected daily
    const prevSnapshot = await ANALYTICS_SNAPSHOTS.findOne({ date: prevDate });
    const nextSnapshot = await ANALYTICS_SNAPSHOTS.findOne({ date: nextDate });
    
    if (prevSnapshot) {
      // Calculate what the snapshot should be
      const prevCumulative = prevSnapshot.total?.views || 0;
      const correctedCumulative = prevCumulative + correctedViews;
      
      // Update sites in snapshot
      const correctedSnapshotSites = {};
      const prevSites = prevSnapshot.sites || {};
      
      for (const [domain, correctedData] of Object.entries(correctedSites)) {
        const prevSiteData = prevSites[domain] || { views: 0, clicks: 0 };
        correctedSnapshotSites[domain] = {
          views: (prevSiteData.views || 0) + correctedData.views,
          clicks: (prevSiteData.clicks || 0) + correctedData.clicks
        };
      }
      
      await ANALYTICS_SNAPSHOTS.updateOne(
        { date: TARGET_DATE },
        {
          $set: {
            total: { views: correctedCumulative, clicks: (prevSnapshot.total?.clicks || 0) + correctedClicks },
            sites: correctedSnapshotSites,
            anomalousPeakFixed: true,
            fixedAt: new Date()
          }
        }
      );
      
      // Also need to fix all subsequent snapshots!
      console.log(`\nFixing subsequent snapshots...`);
      
      const subsequentSnapshots = await ANALYTICS_SNAPSHOTS.find({
        date: { $gt: TARGET_DATE }
      }).sort({ date: 1 }).toArray();
      
      let runningCumulativeViews = correctedCumulative;
      let runningCumulativeClicks = prevSnapshot.total?.clicks || 0 + correctedClicks;
      const runningCumulativeSites = { ...correctedSnapshotSites };
      
      for (const snap of subsequentSnapshots) {
        // Get the daily record for this date
        const dailyRecord = await ANALYTICS_DAILY.findOne({ date: snap.date });
        const dailyViews = dailyRecord?.total?.views || 0;
        const dailyClicks = dailyRecord?.total?.clicks || 0;
        
        runningCumulativeViews += dailyViews;
        runningCumulativeClicks += dailyClicks;
        
        // Update site cumulative
        for (const [domain, dailyData] of Object.entries(dailyRecord?.sites || {})) {
          if (!runningCumulativeSites[domain]) {
            runningCumulativeSites[domain] = { views: 0, clicks: 0 };
          }
          runningCumulativeSites[domain].views += dailyData.views || 0;
          runningCumulativeSites[domain].clicks += dailyData.clicks || 0;
        }
        
        await ANALYTICS_SNAPSHOTS.updateOne(
          { date: snap.date },
          {
            $set: {
              total: { views: runningCumulativeViews, clicks: runningCumulativeClicks },
              sites: JSON.parse(JSON.stringify(runningCumulativeSites)),
              cascadeFixed: true,
              cascadeFixedAt: new Date()
            }
          }
        );
      }
      
      console.log(`Fixed ${subsequentSnapshots.length} subsequent snapshots`);
    }

    console.log(`\n✅ ${TARGET_DATE} fixed successfully!`);
    console.log(`  Was: ${targetViews} views`);
    console.log(`  Now: ${correctedViews} views`);
    console.log(`  Across ${Object.keys(correctedSites).length} sites`);

    // Show final state
    const finalRecord = await ANALYTICS_DAILY.findOne({ date: TARGET_DATE });
    console.log(`\n=== Final State ===`);
    console.log(`${TARGET_DATE}: ${finalRecord?.total?.views || 0} views`);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
    }
  }
}

function getPreviousDate(dateStr) {
  const date = new Date(dateStr);
  date.setDate(date.getDate() - 1);
  return date.toISOString().split('T')[0];
}

function getNextDate(dateStr) {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + 1);
  return date.toISOString().split('T')[0];
}

fixSpecificDate()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Failed:', error);
    process.exit(1);
  });
