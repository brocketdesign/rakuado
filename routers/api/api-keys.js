const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { ObjectId } = require('mongodb');
const ensureAuthenticated = require('../../middleware/authMiddleware');
const ensureMembership = require('../../middleware/ensureMembership');

// All routes require authentication
router.use(ensureAuthenticated);
router.use(ensureMembership);

// Generate a secure API key
function generateApiKey() {
  const prefix = 'rk_live_';
  const key = crypto.randomBytes(32).toString('hex');
  return prefix + key;
}

// Hash API key for storage (we only store the hash)
function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

// GET all API keys for the current user
router.get('/', async (req, res) => {
  try {
    const db = global.db;
    const keys = await db.collection('apiKeys')
      .find({ userId: new ObjectId(req.user._id) })
      .sort({ createdAt: -1 })
      .toArray();

    // Mask the keys - only show prefix and last 4 chars
    const maskedKeys = keys.map(k => ({
      _id: k._id,
      name: k.name,
      keyPreview: k.keyPreview,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt,
      usageCount: k.usageCount || 0,
      isActive: k.isActive
    }));

    res.json({ success: true, apiKeys: maskedKeys });
  } catch (error) {
    console.error('Error fetching API keys:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch API keys' });
  }
});

// POST create a new API key
router.post('/', async (req, res) => {
  try {
    const db = global.db;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'API key name is required' });
    }

    // Generate the plaintext API key
    const apiKey = generateApiKey();
    const hashedKey = hashApiKey(apiKey);

    // Create a preview (prefix + last 4 chars)
    const keyPreview = apiKey.substring(0, 8) + '...' + apiKey.substring(apiKey.length - 4);

    const newKey = {
      userId: new ObjectId(req.user._id),
      name: name.trim(),
      keyHash: hashedKey,
      keyPreview: keyPreview,
      isActive: true,
      usageCount: 0,
      createdAt: new Date(),
      lastUsedAt: null
    };

    const result = await db.collection('apiKeys').insertOne(newKey);

    // Return the full key ONLY on creation (won't be shown again)
    res.status(201).json({
      success: true,
      message: 'API key created successfully',
      apiKey: {
        _id: result.insertedId,
        name: newKey.name,
        key: apiKey, // Full key - only returned once
        keyPreview: keyPreview,
        createdAt: newKey.createdAt,
        isActive: true
      }
    });
  } catch (error) {
    console.error('Error creating API key:', error);
    res.status(500).json({ success: false, error: 'Failed to create API key' });
  }
});

// PUT update API key name
router.put('/:id', async (req, res) => {
  try {
    const db = global.db;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'API key name is required' });
    }

    const result = await db.collection('apiKeys').updateOne(
      { _id: new ObjectId(req.params.id), userId: new ObjectId(req.user._id) },
      { $set: { name: name.trim(), updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, error: 'API key not found' });
    }

    res.json({ success: true, message: 'API key updated' });
  } catch (error) {
    console.error('Error updating API key:', error);
    res.status(500).json({ success: false, error: 'Failed to update API key' });
  }
});

// PUT toggle API key active/inactive
router.put('/:id/toggle', async (req, res) => {
  try {
    const db = global.db;
    const key = await db.collection('apiKeys').findOne({
      _id: new ObjectId(req.params.id),
      userId: new ObjectId(req.user._id)
    });

    if (!key) {
      return res.status(404).json({ success: false, error: 'API key not found' });
    }

    await db.collection('apiKeys').updateOne(
      { _id: key._id },
      { $set: { isActive: !key.isActive, updatedAt: new Date() } }
    );

    res.json({ success: true, isActive: !key.isActive });
  } catch (error) {
    console.error('Error toggling API key:', error);
    res.status(500).json({ success: false, error: 'Failed to toggle API key' });
  }
});

// DELETE an API key
router.delete('/:id', async (req, res) => {
  try {
    const db = global.db;
    const result = await db.collection('apiKeys').deleteOne({
      _id: new ObjectId(req.params.id),
      userId: new ObjectId(req.user._id)
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, error: 'API key not found' });
    }

    res.json({ success: true, message: 'API key deleted' });
  } catch (error) {
    console.error('Error deleting API key:', error);
    res.status(500).json({ success: false, error: 'Failed to delete API key' });
  }
});

module.exports = router;
