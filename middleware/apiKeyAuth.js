const crypto = require('crypto');
const { ObjectId } = require('mongodb');

/**
 * Middleware to authenticate requests using an API key.
 * The API key should be passed in the `x-api-key` header or as `api_key` query parameter.
 */
async function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;

  if (!apiKey) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'API key is required. Pass it via the x-api-key header or api_key query parameter.'
    });
  }

  try {
    const db = global.db;
    const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');

    const keyDoc = await db.collection('apiKeys').findOne({
      keyHash: hashedKey,
      isActive: true
    });

    if (!keyDoc) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or inactive API key.'
      });
    }

    // Update usage stats
    await db.collection('apiKeys').updateOne(
      { _id: keyDoc._id },
      {
        $set: { lastUsedAt: new Date() },
        $inc: { usageCount: 1 }
      }
    );

    // Attach the user to the request
    const user = await db.collection('users').findOne({ _id: keyDoc.userId });
    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'API key owner not found.'
      });
    }

    req.apiUser = user;
    req.apiKeyDoc = keyDoc;
    next();
  } catch (error) {
    console.error('API key authentication error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = authenticateApiKey;
