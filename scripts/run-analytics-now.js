require('dotenv').config();
const { MongoClient } = require('mongodb');
const path = require('path');
const { runBackupNow, runAggregateNow } = require(path.join(__dirname, '..', 'modules', 'cronjob-analytics'));

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

    console.log('Connected to MongoDB, running backup (snapshot)...');
    await runBackupNow(db);
    console.log('Backup (snapshot) complete. Now running daily aggregation...');
    await runAggregateNow(db);
    console.log('Daily aggregation complete.');

    // Optionally print today's analyticsDaily entry for quick verification
    const today = new Date().toISOString().split('T')[0];
    const daily = await db.collection('analyticsDaily').findOne({ date: today });
    console.log('analyticsDaily entry for', today, ':', JSON.stringify(daily, null, 2));

  } catch (err) {
    console.error('Error running analytics now:', err);
    process.exitCode = 1;
  } finally {
    if (client) await client.close();
  }
})();
