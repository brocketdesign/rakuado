const { MongoClient } = require('mongodb');

let _db = null;
let _connecting = null;

/**
 * Returns a cached MongoDB database instance.
 * On first call it creates the connection; subsequent calls return the cached db.
 * This pattern is safe for serverless environments where the module may be
 * reused across warm invocations but starts fresh on a cold start.
 */
async function connectToDatabase() {
  if (_db) return _db;

  // If a connection attempt is already in-flight, wait for it instead of
  // opening a second connection.
  if (_connecting) return _connecting;

  const url = process.env.MONGODB_URL;
  const dbName = process.env.MONGODB_DATABASE;

  if (!url || !dbName) {
    throw new Error('MONGODB_URL or MONGODB_DATABASE environment variable is not set');
  }

  _connecting = MongoClient.connect(url, {
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 0,
    maxPoolSize: 10,
  }).then((client) => {
    _db = client.db(dbName);
    global.db = _db;
    _connecting = null;
    console.log('✅ Successfully connected to MongoDB');
    return _db;
  }).catch((err) => {
    _connecting = null;
    throw err;
  });

  return _connecting;
}

module.exports = { connectToDatabase };
