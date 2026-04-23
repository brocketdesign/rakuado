const express = require('express');
const router = express.Router();

// GET /api/vibedash/users
// Called by VibeDash to retrieve user analytics. Requires a Bearer token
// matching the VIBEDASH_TOKEN environment variable.
router.get('/users', async (req, res) => {
  // 1. Auth
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token || token !== process.env.VIBEDASH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const db = global.db;
    const usersCollection = db.collection('users');

    // Date boundaries (UTC)
    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 2. Aggregate all counts in parallel
    const [
      totalUsers,
      premiumUsers,
      newUsersToday,
      newUsersThisWeek,
      newUsersThisMonth,
      recentUsers,
    ] = await Promise.all([
      usersCollection.countDocuments({}),
      usersCollection.countDocuments({ subscriptionId: { $exists: true, $ne: null } }),
      usersCollection.countDocuments({ createdAt: { $gte: startOfToday } }),
      usersCollection.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
      usersCollection.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      // Fetch daily signups over the last 30 days for userGrowth chart
      usersCollection.aggregate([
        { $match: { createdAt: { $gte: thirtyDaysAgo } } },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]).toArray(),
    ]);

    const freeUsers = totalUsers - premiumUsers;

    // Shape userGrowth array
    const userGrowth = recentUsers.map((entry) => ({
      date: entry._id,
      count: entry.count,
    }));

    // 3. Return payload
    return res.status(200).json({
      meta: {
        projectName: 'Rakuado',
        fetchedAt: new Date().toISOString(),
      },
      summary: {
        totalUsers,
        premiumUsers,
        newUsersToday,
        newUsersThisWeek,
        newUsersThisMonth,
      },
      metrics: {
        freeUsers,
      },
      charts: {
        userGrowth,
        planBreakdown: [
          { plan: 'free', count: freeUsers },
          { plan: 'premium', count: premiumUsers },
        ],
      },
    });
  } catch (err) {
    console.error('[vibedash] Error fetching user data:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
