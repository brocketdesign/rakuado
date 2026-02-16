/**
 * Debug January 28th Analytics Data
 * 
 * This script inspects all analytics data around January 28th to understand
 * what data exists and what the issue might be.
 * 
 * Usage: node scripts/debug-january-28.js
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');

const url = process.env.MONGODB_URL;
const dbName = process.env.MONGODB_DATABASE;

async function debugJanuary28() {
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

    // Get all daily records sorted by date
    console.log('=== All Daily Records ===\n');
    const allDaily = await ANALYTICS_DAILY.find({}).sort({ date: 1 }).toArray();
    
    if (allDaily.length === 0) {
      console.log('No daily records found at all!');
      return;
    }
    
    console.log(`Found ${allDaily.length} daily records\n`);
    
    // Show all records
    for (const day of allDaily) {
      const marker = day.date === '2025-01-28' ? ' <-- JAN 28' : '';
      const siteCount = Object.keys(day.sites || {}).length;
      console.log(`${day.date}: ${day.total?.views || 0} views, ${day.total?.clicks || 0} clicks (${siteCount} sites)${marker}`);
    }
    
    // Show all snapshots
    console.log('\n\n=== All Snapshots ===\n');
    const allSnapshots = await ANALYTICS_SNAPSHOTS.find({}).sort({ date: 1 }).toArray();
    console.log(`Found ${allSnapshots.length} snapshots\n`);
    
    for (const snap of allSnapshots.slice(0, 20)) { // Show first 20
      const marker = snap.date === '2025-01-28' ? ' <-- JAN 28' : '';
      console.log(`${snap.date}: ${snap.total?.views || 0} views${marker}`);
    }
    
    if (allSnapshots.length > 20) {
      console.log(`... and ${allSnapshots.length - 20} more`);
    }
    
    // Find Jan 28 specifically
    console.log('\n\n=== Looking for January 28th ===\n');
    const jan28Daily = allDaily.find(d => d.date === '2025-01-28');
    const jan28Snapshot = allSnapshots.find(s => s.date === '2025-01-28');
    
    if (jan28Daily) {
      console.log('January 28 DAILY record found:');
      console.log(JSON.stringify(jan28Daily, null, 2));
    } else {
      console.log('January 28 DAILY record: NOT FOUND');
    }
    
    if (jan28Snapshot) {
      console.log('\nJanuary 28 SNAPSHOT record found:');
      console.log('Total:', jan28Snapshot.total);
      console.log('Sites:', Object.keys(jan28Snapshot.sites || {}));
    } else {
      console.log('January 28 SNAPSHOT record: NOT FOUND');
    }
    
    // Check for dates around Jan 28
    console.log('\n\n=== Records around January 28th ===\n');
    const aroundJan28 = await ANALYTICS_DAILY.find({
      date: { $gte: '2025-01-25', $lte: '2025-02-05' }
    }).sort({ date: 1 }).toArray();
    
    for (const day of aroundJan28) {
      const marker = day.date === '2025-01-28' ? ' <-- JAN 28' : '';
      console.log(`${day.date}: ${day.total?.views || 0} views${marker}`);
      
      // Show sites if Jan 28
      if (day.date === '2025-01-28' && day.sites) {
        console.log('  Sites:', Object.entries(day.sites).map(([k, v]) => `${k}: ${v.views}`).join(', '));
      }
    }
    
    // Find the dates with highest values
    console.log('\n\n=== Highest Value Dates ===\n');
    const sortedByViews = [...allDaily].sort((a, b) => (b.total?.views || 0) - (a.total?.views || 0));
    
    for (const day of sortedByViews.slice(0, 10)) {
      console.log(`${day.date}: ${day.total?.views || 0} views`);
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

debugJanuary28()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Failed:', error);
    process.exit(1);
  });
