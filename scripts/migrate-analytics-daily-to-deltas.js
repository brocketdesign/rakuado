require('dotenv').config();
const { MongoClient } = require('mongodb');
const url = process.env.MONGODB_URL;
const dbName = process.env.MONGODB_DATABASE;

(async () => {
  if (!url || !dbName) {
    console.error('MONGODB_URL or MONGODB_DATABASE is not set in environment.');
    process.exit(1);
  }

  let client;
  try {
    client = await MongoClient.connect(url, { useUnifiedTopology: true });
    const db = client.db(dbName);
    const DAILY = db.collection('analyticsDaily');

    // Backup collection
    const backupName = `analyticsDailyBackup_${new Date().toISOString().replace(/[:.]/g, '-')}`;
    console.log('Creating backup collection:', backupName);
    await db.collection(backupName).insertMany(await DAILY.find({}).toArray());

    // Load all daily records sorted by date ascending
    const all = await DAILY.find({}).sort({ date: 1 }).toArray();
    if (all.length === 0) {
      console.log('No records found in analyticsDaily, nothing to do.');
      return;
    }

    let prev = null;
    let updates = 0;
    for (const rec of all) {
      if (!prev) {
        // First record: assume it's the first cumulative baseline; convert to itself (delta = total)
        const deltaTotal = {
          views: rec.total ? rec.total.views || 0 : 0,
          clicks: rec.total ? rec.total.clicks || 0 : 0
        };

        const deltaSites = {};
        for (const [site, data] of Object.entries(rec.sites || {})) {
          deltaSites[site] = { views: data.views || 0, clicks: data.clicks || 0 };
        }

        await DAILY.replaceOne({ _id: rec._id }, { ...rec, total: deltaTotal, sites: deltaSites });
        updates++;
        prev = rec;
        continue;
      }

      // Compute delta = rec.total - prev.total
      const curTotal = rec.total || { views: 0, clicks: 0 };
      const prevTotal = prev.total || { views: 0, clicks: 0 };
      const deltaTotal = {
        views: Math.max(0, (curTotal.views || 0) - (prevTotal.views || 0)),
        clicks: Math.max(0, (curTotal.clicks || 0) - (prevTotal.clicks || 0))
      };

      // Sites: union of keys
      const sites = {};
      const allSites = new Set([...(Object.keys(prev.sites || {})), ...(Object.keys(rec.sites || {}))]);
      for (const site of allSites) {
        const curSite = (rec.sites && rec.sites[site]) ? rec.sites[site] : { views: 0, clicks: 0 };
        const prevSite = (prev.sites && prev.sites[site]) ? prev.sites[site] : { views: 0, clicks: 0 };
        const dViews = Math.max(0, (curSite.views || 0) - (prevSite.views || 0));
        const dClicks = Math.max(0, (curSite.clicks || 0) - (prevSite.clicks || 0));
        if (dViews > 0 || dClicks > 0) {
          sites[site] = { views: dViews, clicks: dClicks };
        }
      }

      // Update record in place
      await DAILY.replaceOne({ _id: rec._id }, { ...rec, total: deltaTotal, sites });
      updates++;
      prev = rec;
    }

    console.log(`Migration complete. Backed up to ${backupName}. Updated ${updates} records.`);
  } catch (err) {
    console.error('Migration error:', err);
    process.exitCode = 1;
  } finally {
    if (client) await client.close();
  }
})();
