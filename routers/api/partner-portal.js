const express = require('express');
const router = express.Router();
const ensureAuthenticated = require('../../middleware/authMiddleware');
const { getCustomMonthPeriod, countActiveDaysFromAnalytics } = require('../../utils/partner-payment');

// All routes require authentication (but NOT admin/membership)
router.use(ensureAuthenticated);

// Helper to extract clean domain from a URL
function cleanDomain(url) {
  if (!url) return '';
  let domain = url.trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, '');
  domain = domain.replace(/^www\./, '');
  domain = domain.replace(/\/$/, '');
  domain = domain.split('/')[0];
  return domain;
}

// Helper to format date as YYYY-MM-DD in local time
function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// GET /api/partner-portal - get the current user's partner request
router.get('/', async (req, res) => {
  try {
    const userEmail = req.user.email;
    const userId = req.user._id.toString();
    const collection = global.db.collection('partnerRequests');

    const request = await collection.findOne(
      { $or: [{ userId }, { email: userEmail }] },
      { sort: { createdAt: -1 } }
    );

    if (!request) {
      return res.json({ success: true, request: null });
    }

    res.json({
      success: true,
      request: { ...request, _id: request._id.toString() },
    });
  } catch (error) {
    console.error('Error fetching partner portal status:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch status' });
  }
});

// POST /api/partner-portal/apply - submit initial application
router.post('/apply', async (req, res) => {
  try {
    const { blogUrl, message } = req.body;
    const userEmail = req.user.email;
    const userId = req.user._id.toString();

    if (!blogUrl || !blogUrl.trim()) {
      return res.status(400).json({ success: false, error: 'Blog URL is required' });
    }

    // Basic URL validation
    try {
      new URL(blogUrl.trim());
    } catch {
      return res.status(400).json({ success: false, error: 'Invalid blog URL format' });
    }

    const collection = global.db.collection('partnerRequests');

    const existing = await collection.findOne({
      $or: [{ userId }, { email: userEmail }],
    });

    if (existing) {
      return res.status(400).json({ success: false, error: 'An application already exists for this account' });
    }

    const now = new Date();
    const newRequest = {
      email: userEmail,
      userId,
      blogUrl: blogUrl.trim(),
      message: (message || '').trim(),
      status: 'pending',
      currentStep: 'submitted',
      createdAt: now,
      updatedAt: now,
      googleAnalyticsUrl: null,
      googleAnalyticsSubmitted: false,
      snippetSent: false,
      snippetVerified: false,
      estimatedMonthlyAmount: null,
      snippetCode: '',
      notes: '',
    };

    const result = await collection.insertOne(newRequest);

    res.json({
      success: true,
      request: { ...newRequest, _id: result.insertedId.toString() },
    });
  } catch (error) {
    console.error('Error submitting partner application:', error);
    res.status(500).json({ success: false, error: 'Failed to submit application' });
  }
});

// PUT /api/partner-portal/analytics-url - submit Google Analytics URL
router.put('/analytics-url', async (req, res) => {
  try {
    const { googleAnalyticsUrl } = req.body;
    const userEmail = req.user.email;
    const userId = req.user._id.toString();

    if (!googleAnalyticsUrl || !googleAnalyticsUrl.trim()) {
      return res.status(400).json({ success: false, error: 'Google Analytics URL is required' });
    }

    // Basic URL validation
    try {
      new URL(googleAnalyticsUrl.trim());
    } catch {
      return res.status(400).json({ success: false, error: 'Invalid URL format' });
    }

    const collection = global.db.collection('partnerRequests');
    const request = await collection.findOne({
      $or: [{ userId }, { email: userEmail }],
    });

    if (!request) {
      return res.status(404).json({ success: false, error: 'Application not found' });
    }

    if (request.status === 'rejected') {
      return res.status(400).json({ success: false, error: 'Application has been rejected' });
    }

    await collection.updateOne(
      { _id: request._id },
      {
        $set: {
          googleAnalyticsUrl: googleAnalyticsUrl.trim(),
          googleAnalyticsSubmitted: true,
          updatedAt: new Date(),
        },
      }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating GA URL:', error);
    res.status(500).json({ success: false, error: 'Failed to update analytics URL' });
  }
});

// GET /api/partner-portal/analytics - get analytics data for user's domain
router.get('/analytics', async (req, res) => {
  try {
    const userEmail = req.user.email;
    const userId = req.user._id.toString();
    const { period = 'current' } = req.query;

    const collection = global.db.collection('partnerRequests');
    const request = await collection.findOne({
      $or: [{ userId }, { email: userEmail }],
    });

    if (!request) {
      return res.status(404).json({ success: false, error: 'Application not found' });
    }

    if (!request.snippetSent && !request.snippetVerified) {
      return res.json({
        success: true,
        data: [],
        domain: null,
        totalViews: 0,
        totalClicks: 0,
        message: 'Snippet not yet active',
      });
    }

    const domain = cleanDomain(request.blogUrl);
    if (!domain) {
      return res.json({ success: true, data: [], domain: null, totalViews: 0, totalClicks: 0 });
    }

    let startDate, endDate;
    if (period === 'previous') {
      ({ startDate, endDate } = getCustomMonthPeriod(1));
    } else {
      ({ startDate, endDate } = getCustomMonthPeriod(0));
    }

    const analyticsData = await global.db.collection('analyticsDaily').find({
      date: {
        $gte: formatLocalDate(startDate),
        $lte: formatLocalDate(endDate),
      },
    }).sort({ date: 1 }).toArray();

    const data = analyticsData.map((day) => {
      const siteData = (day.sites && day.sites[domain]) || { views: 0, clicks: 0 };
      return {
        date: day.date,
        views: siteData.views || 0,
        clicks: siteData.clicks || 0,
      };
    });

    const totalViews = data.reduce((s, d) => s + d.views, 0);
    const totalClicks = data.reduce((s, d) => s + d.clicks, 0);

    res.json({
      success: true,
      data,
      domain,
      totalViews,
      totalClicks,
      period: { start: formatLocalDate(startDate), end: formatLocalDate(endDate) },
    });
  } catch (error) {
    console.error('Error fetching partner analytics:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch analytics' });
  }
});

// GET /api/partner-portal/earnings - get earnings info for current and previous period
router.get('/earnings', async (req, res) => {
  try {
    const userEmail = req.user.email;
    const userId = req.user._id.toString();

    const collection = global.db.collection('partnerRequests');
    const request = await collection.findOne({
      $or: [{ userId }, { email: userEmail }],
    });

    if (!request) {
      return res.status(404).json({ success: false, error: 'Application not found' });
    }

    const monthlyAmount = request.estimatedMonthlyAmount || 0;
    const domain = cleanDomain(request.blogUrl);
    const snippetActive = !!(request.snippetSent || request.snippetVerified);

    const { startDate, endDate } = getCustomMonthPeriod(0);
    const { startDate: prevStart, endDate: prevEnd } = getCustomMonthPeriod(1);

    // Count active days only if snippet is live
    let activeDays = 0;
    let prevActiveDays = 0;
    if (domain && snippetActive) {
      activeDays = await countActiveDaysFromAnalytics(global.db, domain, startDate, endDate);
      prevActiveDays = await countActiveDaysFromAnalytics(global.db, domain, prevStart, prevEnd);
    }

    const totalDays = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
    const prevTotalDays = Math.round((prevEnd - prevStart) / (1000 * 60 * 60 * 24)) + 1;

    const dailyRate = totalDays > 0 ? monthlyAmount / totalDays : 0;
    const prevDailyRate = prevTotalDays > 0 ? monthlyAmount / prevTotalDays : 0;

    res.json({
      success: true,
      monthlyAmount,
      snippetActive,
      currentPeriod: {
        start: formatLocalDate(startDate),
        end: formatLocalDate(endDate),
        totalDays,
        activeDays,
        dailyRate: Math.round(dailyRate),
        estimatedEarnings: Math.round(dailyRate * activeDays),
      },
      previousPeriod: {
        start: formatLocalDate(prevStart),
        end: formatLocalDate(prevEnd),
        totalDays: prevTotalDays,
        activeDays: prevActiveDays,
        dailyRate: Math.round(prevDailyRate),
        estimatedEarnings: Math.round(prevDailyRate * prevActiveDays),
      },
    });
  } catch (error) {
    console.error('Error fetching partner earnings:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch earnings' });
  }
});

module.exports = router;
