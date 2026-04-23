const express = require('express');
const router = express.Router();

// GET /api/vibedash/users
// Called by VibeDash to retrieve comprehensive admin analytics.
// Requires Authorization: Bearer <VIBEDASH_TOKEN>.
router.get('/users', async (req, res) => {
  // 1. Auth
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token || token !== process.env.VIBEDASH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const db = global.db;
    const usersCol = db.collection('users');

    // ── Date boundaries ────────────────────────────────────────────────────
    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    // YYYY-MM-DD string used by analyticsDaily's date field
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10);

    // ── Fire all DB queries in parallel ────────────────────────────────────
    const [
      // Users
      totalUsers,
      premiumUsers,
      newUsersToday,
      newUsersThisWeek,
      newUsersThisMonth,
      userGrowthRaw,

      // Partner pipeline
      totalPartnerApplications,
      partnerStatusRaw,
      activePartners,
      partnerRevenueAgg,

      // Sites: per-domain totals aggregated from analyticsDaily
      siteAnalytics,

      // Ad network
      totalAdvertisers,
      activeCampaigns,
      totalImpressions,
      totalAdClicks,
      adSpendAgg,

      // Mailing lists
      totalMailingLists,
      totalSubscribers,

      // Support
      openSupportTickets,

      // Affiliate program
      totalAffiliates,

      // Daily page-view trend (last 30 days)
      dailyPageViewsRaw,
    ] = await Promise.all([
      // ── Users ────────────────────────────────────────────────────────────
      usersCol.countDocuments({}),
      usersCol.countDocuments({ subscriptionId: { $exists: true, $ne: null } }),
      usersCol.countDocuments({ createdAt: { $gte: startOfToday } }),
      usersCol.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
      usersCol.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      usersCol.aggregate([
        { $match: { createdAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]).toArray(),

      // ── Partners ─────────────────────────────────────────────────────────
      db.collection('partnerRequests').countDocuments({}),
      db.collection('partnerRequests').aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]).toArray(),
      db.collection('partners').countDocuments({ status: 'active' }),
      // Sum monthlyAmount for active partners → monthly committed revenue
      db.collection('partners').aggregate([
        { $match: { status: 'active' } },
        { $group: { _id: null, total: { $sum: '$monthlyAmount' } } },
      ]).toArray(),

      // ── Sites ────────────────────────────────────────────────────────────
      // analyticsDaily.sites is { domain: { views, clicks } }; unwind to get per-site totals
      db.collection('analyticsDaily').aggregate([
        { $project: { sites: { $objectToArray: { $ifNull: ['$sites', {}] } } } },
        { $unwind: { path: '$sites', preserveNullAndEmptyArrays: false } },
        { $group: { _id: '$sites.k', totalViews: { $sum: '$sites.v.views' }, totalClicks: { $sum: '$sites.v.clicks' } } },
        { $sort: { totalViews: -1 } },
      ]).toArray(),

      // ── Ad network ───────────────────────────────────────────────────────
      db.collection('adCampaigns').distinct('advertiserId').then((arr) => arr.length),
      db.collection('adCampaigns').countDocuments({ status: 'active' }),
      db.collection('adImpressions').estimatedDocumentCount(),
      db.collection('adClicks').estimatedDocumentCount(),
      // spend amounts are stored as negative numbers
      db.collection('adBudgetTransactions').aggregate([
        { $match: { type: 'spend' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]).toArray(),

      // ── Mailing ──────────────────────────────────────────────────────────
      db.collection('mailingLists').countDocuments({}),
      db.collection('mailingListSubscribers').countDocuments({}),

      // ── Support ──────────────────────────────────────────────────────────
      db.collection('supportTickets').countDocuments({ status: 'open' }),

      // ── Affiliate ────────────────────────────────────────────────────────
      db.collection('affiliate').countDocuments({}),

      // ── Analytics trend ──────────────────────────────────────────────────
      db.collection('analyticsDaily').aggregate([
        { $match: { date: { $gte: thirtyDaysAgoStr } } },
        { $group: { _id: '$date', views: { $sum: '$total.views' }, clicks: { $sum: '$total.clicks' } } },
        { $sort: { _id: 1 } },
      ]).toArray(),
    ]);

    // ── Derived values ─────────────────────────────────────────────────────
    const freeUsers = totalUsers - premiumUsers;
    const totalSites = siteAnalytics.length;
    const totalPageViews = siteAnalytics.reduce((sum, s) => sum + (s.totalViews || 0), 0);
    const totalAdClicks_ = totalAdClicks; // alias for clarity in output
    const avgPageViewsPerSite = totalSites > 0 ? Math.round(totalPageViews / totalSites) : 0;
    const avgSitesPerUser = totalUsers > 0 ? +(totalSites / totalUsers).toFixed(2) : 0;
    const monthlyPartnerRevenue = partnerRevenueAgg[0]?.total || 0;
    const totalAdSpend = adSpendAgg[0] ? Math.abs(adSpendAgg[0].total) : 0;
    const avgSubscribersPerList = totalMailingLists > 0 ? Math.round(totalSubscribers / totalMailingLists) : 0;

    // ── Response ───────────────────────────────────────────────────────────
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
        // Users
        freeUsers,

        // Sites
        totalSites,
        totalPageViews,
        avgPageViewsPerSite,
        avgSitesPerUser,

        // Partners
        totalPartnerApplications,
        activePartners,
        monthlyPartnerRevenue,

        // Ad network
        totalAdvertisers,
        activeCampaigns,
        totalImpressions,
        totalAdClicks: totalAdClicks_,
        totalAdSpend: +totalAdSpend.toFixed(2),

        // Mailing
        totalMailingLists,
        totalSubscribers,
        avgSubscribersPerList,

        // Support & Affiliate
        openSupportTickets,
        totalAffiliates,
      },

      charts: {
        // User growth: daily new signups (last 30 days)
        userGrowth: userGrowthRaw.map((e) => ({ date: e._id, count: e.count })),

        // Plan split
        planBreakdown: [
          { plan: 'free', count: freeUsers },
          { plan: 'premium', count: premiumUsers },
        ],

        // Partner application funnel by status
        partnerApplicationStatus: partnerStatusRaw.map((e) => ({
          status: e._id || 'unknown',
          count: e.count,
        })),

        // Top 20 sites by total page views (all time)
        topSitesByPageViews: siteAnalytics.slice(0, 20).map((s) => ({
          site: s._id,
          views: s.totalViews,
          clicks: s.totalClicks,
        })),

        // Network-wide page views per day (last 30 days)
        dailyPageViews: dailyPageViewsRaw.map((e) => ({
          date: e._id,
          views: e.views,
          clicks: e.clicks,
        })),
      },
    });
  } catch (err) {
    console.error('[vibedash] Error fetching data:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
