/**
 * Fix Per-Site Analytics Data Script (Robust Version)
 * 
 * This script fixes accumulated per-site analytics data. It works in two modes:
 * 1. If recent refery data exists: Rebuilds from actual refery entries
 * 2. If refery is purged (24h+ old): Uses proportional scaling based on popup totals
 * 
 * Usage: node scripts/fix-per-site-analytics.js
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');

const url = process.env.MONGODB_URL;
const dbName = process.env.MONGODB_DATABASE;

async function fixPerSiteAnalytics() {
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

    // Step 1: Create backups
    const backupSuffix = new Date().toISOString().replace(/[:.]/g, '-');
    const dailyBackupName = `analyticsDaily_backup_per_site_fix_${backupSuffix}`;
    const snapshotsBackupName = `analyticsSnapshots_backup_per_site_fix_${backupSuffix}`;
    
    console.log(`Creating backups...`);
    const dailyDocs = await ANALYTICS_DAILY.find({}).toArray();
    if (dailyDocs.length > 0) {
      await db.collection(dailyBackupName).insertMany(dailyDocs);
      console.log(`  Daily backup: ${dailyDocs.length} records -> ${dailyBackupName}`);
    }
    
    const snapshotDocs = await ANALYTICS_SNAPSHOTS.find({}).toArray();
    if (snapshotDocs.length > 0) {
      await db.collection(snapshotsBackupName).insertMany(snapshotDocs);
      console.log(`  Snapshots backup: ${snapshotDocs.length} records -> ${snapshotsBackupName}`);
    }

    // Step 2: Get all refery entries from popups
    const popups = await POPUPS.find({}).toArray();
    
    // Get total cumulative from popups (ground truth)
    let totalCumulativeViews = 0;
    let totalCumulativeClicks = 0;
    for (const popup of popups) {
      totalCumulativeViews += popup.views || 0;
      totalCumulativeClicks += popup.clicks || 0;
    }
    
    console.log(`\nCurrent popup totals: ${totalCumulativeViews} views, ${totalCumulativeClicks} clicks`);

    // Collect all refery entries
    const allReferyEntries = [];
    for (const popup of popups) {
      for (const ref of (popup.refery || [])) {
        if (ref.timestamp) {
          allReferyEntries.push({
            timestamp: ref.timestamp,
            domain: ref.domain || 'unknown',
            views: ref.view || 0,
            clicks: ref.click || 0
          });
        }
      }
    }
    
    allReferyEntries.sort((a, b) => a.timestamp - b.timestamp);
    console.log(`Found ${allReferyEntries.length} refery entries`);

    // Step 3: Get date range from existing daily records
    const existingDaily = await ANALYTICS_DAILY.find({}).sort({ date: 1 }).toArray();
    if (existingDaily.length === 0) {
      console.log('No existing daily records found. Nothing to fix.');
      return;
    }

    const firstDate = existingDaily[0].date;
    const lastDate = existingDaily[existingDaily.length - 1].date;
    
    console.log(`\nDate range to fix: ${firstDate} to ${lastDate}`);

    // Step 4: Calculate per-site proportions from refery data
    const siteTotalsFromRefery = {};
    let totalViewsFromRefery = 0;
    let totalClicksFromRefery = 0;
    
    for (const entry of allReferyEntries) {
      totalViewsFromRefery += entry.views;
      totalClicksFromRefery += entry.clicks;
      
      if (!siteTotalsFromRefery[entry.domain]) {
        siteTotalsFromRefery[entry.domain] = { views: 0, clicks: 0 };
      }
      siteTotalsFromRefery[entry.domain].views += entry.views;
      siteTotalsFromRefery[entry.domain].clicks += entry.clicks;
    }

    // Calculate site proportions
    const siteProportions = {};
    if (totalViewsFromRefery > 0) {
      for (const [domain, totals] of Object.entries(siteTotalsFromRefery)) {
        siteProportions[domain] = {
          views: totals.views / totalViewsFromRefery,
          clicks: totals.clicks / totalClicksFromRefery
        };
      }
    }
    
    console.log(`\nSite proportions from refery:`);
    for (const [domain, prop] of Object.entries(siteProportions)) {
      console.log(`  ${domain}: ${(prop.views * 100).toFixed(1)}% of views`);
    }

    // Step 5: Rebuild daily records with correct per-site breakdown
    console.log('\nRebuilding daily records with per-site breakdown...\n');
    
    let runningTotalViews = 0;
    let runningTotalClicks = 0;
    const runningSiteTotals = {};
    
    let fixedCount = 0;
    
    for (const dayRecord of existingDaily) {
      const dateStr = dayRecord.date;
      const dailyTotalViews = dayRecord.total?.views || 0;
      const dailyTotalClicks = dayRecord.total?.clicks || 0;
      
      // Distribute daily totals across sites using proportions
      const dailySites = {};
      
      if (totalViewsFromRefery > 0 && Object.keys(siteProportions).length > 0) {
        // Use proportional distribution based on refery data
        for (const [domain, prop] of Object.entries(siteProportions)) {
          const siteViews = Math.round(dailyTotalViews * prop.views);
          const siteClicks = Math.round(dailyTotalClicks * prop.clicks);
          
          if (siteViews > 0 || siteClicks > 0) {
            dailySites[domain] = { views: siteViews, clicks: siteClicks };
          }
          
          // Update running totals for cumulative snapshot
          if (!runningSiteTotals[domain]) {
            runningSiteTotals[domain] = { views: 0, clicks: 0 };
          }
          runningSiteTotals[domain].views += siteViews;
          runningSiteTotals[domain].clicks += siteClicks;
        }
      } else {
        // No refery data - use existing site data if any, or create single entry
        if (dayRecord.sites && Object.keys(dayRecord.sites).length > 0) {
          // Keep existing structure but ensure values are reasonable
          for (const [domain, data] of Object.entries(dayRecord.sites)) {
            // Cap site values at the daily total (prevents accumulated values)
            const cappedViews = Math.min(data.views || 0, dailyTotalViews);
            const cappedClicks = Math.min(data.clicks || 0, dailyTotalClicks);
            
            if (cappedViews > 0 || cappedClicks > 0) {
              dailySites[domain] = { views: cappedViews, clicks: cappedClicks };
            }
            
            if (!runningSiteTotals[domain]) {
              runningSiteTotals[domain] = { views: 0, clicks: 0 };
            }
            runningSiteTotals[domain].views += cappedViews;
            runningSiteTotals[domain].clicks += cappedClicks;
          }
        }
      }
      
      // Update running totals
      runningTotalViews += dailyTotalViews;
      runningTotalClicks += dailyTotalClicks;
      
      // Update daily record
      await ANALYTICS_DAILY.updateOne(
        { _id: dayRecord._id },
        {
          $set: {
            sites: dailySites,
            fixedPerSite: true,
            fixedAt: new Date()
          }
        }
      );
      
      // Update snapshot
      await ANALYTICS_SNAPSHOTS.replaceOne(
        { date: dateStr },
        {
          date: dateStr,
          timestamp: dayRecord.timestamp || new Date(dateStr).getTime(),
          total: { views: runningTotalViews, clicks: runningTotalClicks },
          sites: JSON.parse(JSON.stringify(runningSiteTotals)),
          fixedPerSite: true,
          fixedAt: new Date()
        },
        { upsert: true }
      );
      
      const siteCount = Object.keys(dailySites).length;
      console.log(`${dateStr}: ${dailyTotalViews} views across ${siteCount} sites`);
      fixedCount++;
    }

    // Step 6: Verify totals match
    const finalDailySum = await ANALYTICS_DAILY.aggregate([
      { $group: { _id: null, views: { $sum: '$total.views' }, clicks: { $sum: '$total.clicks' } } }
    ]).toArray();
    
    const finalSnapshot = await ANALYTICS_SNAPSHOTS.find({}).sort({ date: -1 }).limit(1).toArray();
    const latestSnapshot = finalSnapshot[0];

    console.log('\n=== Verification ===');
    if (finalDailySum.length > 0) {
      console.log(`Sum of daily records: ${finalDailySum[0].views} views, ${finalDailySum[0].clicks} clicks`);
    }
    if (latestSnapshot) {
      console.log(`Latest snapshot: ${latestSnapshot.total?.views || 0} views, ${latestSnapshot.total?.clicks || 0} clicks`);
    }
    console.log(`Popup totals: ${totalCumulativeViews} views, ${totalCumulativeClicks} clicks`);
    
    console.log('\n=== Summary ===');
    console.log(`Fixed ${fixedCount} daily records`);
    console.log(`Backups created: ${dailyBackupName}, ${snapshotsBackupName}`);
    console.log('\n✅ Per-site fix complete!');
    console.log('\nNote: Site proportions were calculated from available refery data.');
    console.log('If refery data is limited (24h rolling), proportions may not be perfect for all sites.');
    
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
fixPerSiteAnalytics()
  .then(() => {
    console.log('\nScript completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
  });
