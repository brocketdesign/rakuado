const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const authenticateApiKey = require('../../middleware/apiKeyAuth');

// All routes require API key authentication
router.use(authenticateApiKey);

// ============================================================
// AFFILIATES
// ============================================================

// GET /v1/affiliates - List all affiliates
router.get('/affiliates', async (req, res) => {
  try {
    const db = global.db;
    const { limit = 50, offset = 0, domain, isActive } = req.query;

    const filter = {};
    if (domain) filter.domain = { $regex: domain, $options: 'i' };
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const affiliates = await db.collection('affiliate')
      .find(filter)
      .sort({ _id: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit))
      .toArray();

    const total = await db.collection('affiliate').countDocuments(filter);

    res.json({
      success: true,
      data: affiliates,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + affiliates.length < total
      }
    });
  } catch (error) {
    console.error('API error - list affiliates:', error);
    res.status(500).json({ error: 'Failed to fetch affiliates' });
  }
});

// GET /v1/affiliates/:id - Get single affiliate
router.get('/affiliates/:id', async (req, res) => {
  try {
    const db = global.db;
    const affiliate = await db.collection('affiliate').findOne({ _id: new ObjectId(req.params.id) });

    if (!affiliate) {
      return res.status(404).json({ error: 'Affiliate not found' });
    }

    res.json({ success: true, data: affiliate });
  } catch (error) {
    console.error('API error - get affiliate:', error);
    res.status(500).json({ error: 'Failed to fetch affiliate' });
  }
});

// POST /v1/affiliates - Create a new affiliate
router.post('/affiliates', async (req, res) => {
  try {
    const db = global.db;
    const { wordpressUrl, name, isActive, ...otherFields } = req.body;

    if (!wordpressUrl) {
      return res.status(400).json({ error: 'wordpressUrl is required' });
    }

    const parsedUrl = new URL(wordpressUrl);
    const domain = parsedUrl.hostname;

    const affiliateData = {
      wordpressUrl,
      domain,
      name: name || domain,
      isActive: isActive !== undefined ? isActive : true,
      ...otherFields,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const filter = { domain };
    const update = { $set: affiliateData };
    const result = await db.collection('affiliate').updateOne(filter, update, { upsert: true });

    res.status(result.upsertedCount > 0 ? 201 : 200).json({
      success: true,
      data: affiliateData,
      upsertedId: result.upsertedId?._id || null,
      message: result.upsertedCount > 0 ? 'Affiliate created' : 'Affiliate updated'
    });
  } catch (error) {
    console.error('API error - create affiliate:', error);
    res.status(500).json({ error: 'Failed to create affiliate' });
  }
});

// PUT /v1/affiliates/:id - Update an affiliate
router.put('/affiliates/:id', async (req, res) => {
  try {
    const db = global.db;
    const updates = { ...req.body, updatedAt: new Date() };
    delete updates._id;

    if (updates.wordpressUrl) {
      const parsedUrl = new URL(updates.wordpressUrl);
      updates.domain = parsedUrl.hostname;
    }

    const result = await db.collection('affiliate').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: updates }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Affiliate not found' });
    }

    const updated = await db.collection('affiliate').findOne({ _id: new ObjectId(req.params.id) });
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('API error - update affiliate:', error);
    res.status(500).json({ error: 'Failed to update affiliate' });
  }
});

// DELETE /v1/affiliates/:id - Delete an affiliate
router.delete('/affiliates/:id', async (req, res) => {
  try {
    const db = global.db;
    const result = await db.collection('affiliate').deleteOne({ _id: new ObjectId(req.params.id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Affiliate not found' });
    }

    res.json({ success: true, message: 'Affiliate deleted' });
  } catch (error) {
    console.error('API error - delete affiliate:', error);
    res.status(500).json({ error: 'Failed to delete affiliate' });
  }
});

// ============================================================
// AFFILIATE ANALYTICS (Clicks / Views)
// ============================================================

// GET /v1/affiliates/:id/clicks/today - Get clicks for today
router.get('/affiliates/:id/clicks/today', async (req, res) => {
  try {
    const db = global.db;
    const affiliateId = new ObjectId(req.params.id);

    const today = new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' });
    const dateObj = new Date(today + ' UTC');
    const formattedDate = dateObj.toISOString().split('T')[0];
    const yearMonth = formattedDate.slice(0, 7);

    const [dailyClicks, dailyViews, monthlyClicks, monthlyViews] = await Promise.all([
      db.collection('affiliate-analytic').findOne({ affiliateId, date: formattedDate, action: 'click' }),
      db.collection('affiliate-analytic').findOne({ affiliateId, date: formattedDate, action: 'view' }),
      db.collection('affiliate-monthly-analytic').findOne({ affiliateId, month: yearMonth, action: 'click' }),
      db.collection('affiliate-monthly-analytic').findOne({ affiliateId, month: yearMonth, action: 'view' })
    ]);

    res.json({
      success: true,
      data: {
        date: formattedDate,
        daily: {
          clicks: dailyClicks?.count || 0,
          views: dailyViews?.count || 0
        },
        monthly: {
          month: yearMonth,
          clicks: monthlyClicks?.count || 0,
          views: monthlyViews?.count || 0
        }
      }
    });
  } catch (error) {
    console.error('API error - affiliate clicks today:', error);
    res.status(500).json({ error: 'Failed to fetch click data' });
  }
});

// GET /v1/affiliates/:id/clicks/range - Get clicks over a date range
router.get('/affiliates/:id/clicks/range', async (req, res) => {
  try {
    const db = global.db;
    const { startDate, endDate, action = 'click' } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required (YYYY-MM-DD)' });
    }

    const affiliateId = new ObjectId(req.params.id);

    const data = await db.collection('affiliate-analytic').aggregate([
      {
        $match: {
          affiliateId,
          action,
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$date',
          count: { $sum: '$count' }
        }
      },
      { $sort: { _id: 1 } }
    ]).toArray();

    // Fill in missing dates with 0
    const result = [];
    const current = new Date(startDate);
    const end = new Date(endDate);
    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      const existing = data.find(d => d._id === dateStr);
      result.push({ date: dateStr, count: existing?.count || 0 });
      current.setDate(current.getDate() + 1);
    }

    res.json({
      success: true,
      data: result,
      summary: {
        total: result.reduce((sum, d) => sum + d.count, 0),
        startDate,
        endDate,
        action
      }
    });
  } catch (error) {
    console.error('API error - affiliate clicks range:', error);
    res.status(500).json({ error: 'Failed to fetch click data' });
  }
});

// GET /v1/affiliates/:id/stats - Get comprehensive affiliate stats
router.get('/affiliates/:id/stats', async (req, res) => {
  try {
    const db = global.db;
    const affiliateId = new ObjectId(req.params.id);

    const affiliate = await db.collection('affiliate').findOne({ _id: affiliateId });
    if (!affiliate) {
      return res.status(404).json({ error: 'Affiliate not found' });
    }

    // Get monthly stats for the last 6 months
    const now = new Date();
    const months = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    const monthlyStats = await db.collection('affiliate-monthly-analytic')
      .find({ affiliateId, month: { $in: months } })
      .toArray();

    // Organize by month
    const statsByMonth = {};
    for (const m of months) {
      statsByMonth[m] = { clicks: 0, views: 0 };
    }
    for (const stat of monthlyStats) {
      if (!statsByMonth[stat.month]) statsByMonth[stat.month] = { clicks: 0, views: 0 };
      statsByMonth[stat.month][stat.action] = stat.count;
    }

    res.json({
      success: true,
      data: {
        affiliate: {
          _id: affiliate._id,
          domain: affiliate.domain,
          wordpressUrl: affiliate.wordpressUrl,
          isActive: affiliate.isActive
        },
        monthlyStats: statsByMonth
      }
    });
  } catch (error) {
    console.error('API error - affiliate stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ============================================================
// WEBSITES (Sites from analytics)
// ============================================================

// GET /v1/websites - List all tracked websites
router.get('/websites', async (req, res) => {
  try {
    const db = global.db;

    // Get sites from the most recent analytics record
    const dailyData = await db.collection('analyticsDaily')
      .find({})
      .sort({ date: -1 })
      .limit(30)
      .toArray();

    // Collect all unique sites
    const siteSet = new Set();
    for (const day of dailyData) {
      if (day.sites) {
        Object.keys(day.sites).forEach(s => siteSet.add(s));
      }
    }

    // Also include affiliate domains
    const affiliates = await db.collection('affiliate').find({}).toArray();
    const affiliateDomains = affiliates.map(a => a.domain).filter(Boolean);

    const websites = [...siteSet].map(site => {
      const latestDay = dailyData.find(d => d.sites && d.sites[site]);
      const affiliateMatch = affiliates.find(a => a.domain === site);
      return {
        domain: site,
        latestViews: latestDay?.sites?.[site]?.views || 0,
        latestClicks: latestDay?.sites?.[site]?.clicks || 0,
        hasAffiliate: !!affiliateMatch,
        affiliateId: affiliateMatch?._id || null,
        isActive: affiliateMatch?.isActive || false
      };
    });

    res.json({
      success: true,
      data: websites,
      total: websites.length
    });
  } catch (error) {
    console.error('API error - list websites:', error);
    res.status(500).json({ error: 'Failed to fetch websites' });
  }
});

// GET /v1/websites/:domain/analytics - Get analytics for a specific website
router.get('/websites/:domain/analytics', async (req, res) => {
  try {
    const db = global.db;
    const { domain } = req.params;
    const { period = 'current' } = req.query;

    const { startDate, endDate } = getCustomMonthPeriod(period === 'previous' ? 1 : 0);

    const data = await db.collection('analyticsDaily')
      .find({
        date: {
          $gte: startDate.toISOString().split('T')[0],
          $lte: endDate.toISOString().split('T')[0]
        }
      })
      .sort({ date: 1 })
      .toArray();

    const result = [];
    const current = new Date(startDate);
    const endDt = new Date(endDate);

    while (current <= endDt) {
      const dateStr = current.toISOString().split('T')[0];
      const dayData = data.find(d => d.date === dateStr);

      result.push({
        date: dateStr,
        views: dayData?.sites?.[domain]?.views || 0,
        clicks: dayData?.sites?.[domain]?.clicks || 0
      });
      current.setDate(current.getDate() + 1);
    }

    const totalViews = result.reduce((s, d) => s + d.views, 0);
    const totalClicks = result.reduce((s, d) => s + d.clicks, 0);

    res.json({
      success: true,
      data: result,
      summary: {
        domain,
        period,
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        totalViews,
        totalClicks,
        ctr: totalViews > 0 ? Number(((totalClicks / totalViews) * 100).toFixed(2)) : 0
      }
    });
  } catch (error) {
    console.error('API error - website analytics:', error);
    res.status(500).json({ error: 'Failed to fetch website analytics' });
  }
});

// ============================================================
// ANALYTICS (Overall)
// ============================================================

// GET /v1/analytics/summary - Get overall analytics summary
router.get('/analytics/summary', async (req, res) => {
  try {
    const db = global.db;
    const { period = 'current' } = req.query;

    const { startDate, endDate } = getCustomMonthPeriod(period === 'previous' ? 1 : 0);

    const data = await db.collection('analyticsDaily')
      .find({
        date: {
          $gte: startDate.toISOString().split('T')[0],
          $lte: endDate.toISOString().split('T')[0]
        }
      })
      .sort({ date: 1 })
      .toArray();

    const totals = data.reduce((acc, item) => {
      acc.views += item.total ? item.total.views : 0;
      acc.clicks += item.total ? item.total.clicks : 0;
      return acc;
    }, { views: 0, clicks: 0 });

    // Get previous period for comparison
    const prevPeriod = getCustomMonthPeriod(period === 'previous' ? 2 : 1);
    const prevData = await db.collection('analyticsDaily')
      .find({
        date: {
          $gte: prevPeriod.startDate.toISOString().split('T')[0],
          $lte: prevPeriod.endDate.toISOString().split('T')[0]
        }
      })
      .toArray();

    const prevTotals = prevData.reduce((acc, item) => {
      acc.views += item.total ? item.total.views : 0;
      acc.clicks += item.total ? item.total.clicks : 0;
      return acc;
    }, { views: 0, clicks: 0 });

    const ctr = totals.views > 0 ? (totals.clicks / totals.views) * 100 : 0;
    const prevCtr = prevTotals.views > 0 ? (prevTotals.clicks / prevTotals.views) * 100 : 0;

    res.json({
      success: true,
      data: {
        period: {
          name: period,
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0]
        },
        current: {
          views: totals.views,
          clicks: totals.clicks,
          ctr: Number(ctr.toFixed(2))
        },
        previous: {
          views: prevTotals.views,
          clicks: prevTotals.clicks,
          ctr: Number(prevCtr.toFixed(2))
        },
        change: {
          views: prevTotals.views > 0 ? Number(((totals.views - prevTotals.views) / prevTotals.views * 100).toFixed(1)) : 0,
          clicks: prevTotals.clicks > 0 ? Number(((totals.clicks - prevTotals.clicks) / prevTotals.clicks * 100).toFixed(1)) : 0,
          ctr: prevCtr > 0 ? Number(((ctr - prevCtr) / prevCtr * 100).toFixed(1)) : 0
        }
      }
    });
  } catch (error) {
    console.error('API error - analytics summary:', error);
    res.status(500).json({ error: 'Failed to fetch analytics summary' });
  }
});

// GET /v1/analytics/daily - Get daily analytics data
router.get('/analytics/daily', async (req, res) => {
  try {
    const db = global.db;
    const { startDate, endDate, site = 'all' } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required (YYYY-MM-DD)' });
    }

    const data = await db.collection('analyticsDaily')
      .find({
        date: { $gte: startDate, $lte: endDate }
      })
      .sort({ date: 1 })
      .toArray();

    const result = [];
    const current = new Date(startDate);
    const end = new Date(endDate);

    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      const dayData = data.find(d => d.date === dateStr);

      const entry = { date: dateStr, views: 0, clicks: 0 };
      if (dayData) {
        if (site === 'all') {
          entry.views = dayData.total?.views || 0;
          entry.clicks = dayData.total?.clicks || 0;
        } else if (dayData.sites && dayData.sites[site]) {
          entry.views = dayData.sites[site].views || 0;
          entry.clicks = dayData.sites[site].clicks || 0;
        }
      }
      result.push(entry);
      current.setDate(current.getDate() + 1);
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('API error - analytics daily:', error);
    res.status(500).json({ error: 'Failed to fetch daily analytics' });
  }
});

// GET /v1/analytics/sites - Get list of tracked sites
router.get('/analytics/sites', async (req, res) => {
  try {
    const db = global.db;
    const dailyData = await db.collection('analyticsDaily')
      .find({})
      .sort({ date: -1 })
      .limit(1)
      .toArray();

    const sites = ['all'];
    if (dailyData.length > 0 && dailyData[0].sites) {
      sites.push(...Object.keys(dailyData[0].sites));
    }

    res.json({ success: true, data: sites });
  } catch (error) {
    console.error('API error - analytics sites:', error);
    res.status(500).json({ error: 'Failed to fetch sites' });
  }
});

// ============================================================
// PARTNERS
// ============================================================

// GET /v1/partners - List all partners
router.get('/partners', async (req, res) => {
  try {
    const db = global.db;
    const { status, limit = 50, offset = 0 } = req.query;

    const filter = {};
    if (status) filter.status = status;

    const partners = await db.collection('partners')
      .find(filter)
      .sort({ order: 1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit))
      .toArray();

    const total = await db.collection('partners').countDocuments(filter);

    res.json({
      success: true,
      data: partners,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + partners.length < total
      }
    });
  } catch (error) {
    console.error('API error - list partners:', error);
    res.status(500).json({ error: 'Failed to fetch partners' });
  }
});

// GET /v1/partners/:id - Get single partner
router.get('/partners/:id', async (req, res) => {
  try {
    const db = global.db;
    const partner = await db.collection('partners').findOne({ _id: new ObjectId(req.params.id) });

    if (!partner) {
      return res.status(404).json({ error: 'Partner not found' });
    }

    res.json({ success: true, data: partner });
  } catch (error) {
    console.error('API error - get partner:', error);
    res.status(500).json({ error: 'Failed to fetch partner' });
  }
});

// POST /v1/partners - Create a new partner
router.post('/partners', async (req, res) => {
  try {
    const db = global.db;
    const {
      domain, name, nameKatakana, monthlyAmount, paymentCycle,
      startDate, stopDate, status, email, phone, address, notes,
      bankName, bankBranch, accountType, accountNumber, accountHolder
    } = req.body;

    if (!domain || !name || !monthlyAmount || !startDate) {
      return res.status(400).json({ error: 'Required: domain, name, monthlyAmount, startDate' });
    }

    const lastPartner = await db.collection('partners').findOne({}, { sort: { order: -1 } });
    const order = lastPartner ? (lastPartner.order || 0) + 1 : 1;

    const cleanedDomain = cleanDomain(domain);

    const newPartner = {
      order,
      domain: cleanedDomain,
      name,
      nameKatakana: nameKatakana || '',
      monthlyAmount: parseInt(monthlyAmount),
      paymentCycle: paymentCycle || '当月',
      startDate: new Date(startDate),
      stopDate: stopDate ? new Date(stopDate) : null,
      status: status || (stopDate ? 'stopped' : 'active'),
      email: email || '',
      phone: phone || '',
      address: address || '',
      bankInfo: {
        bankName: bankName || '',
        branchName: bankBranch || '',
        accountType: accountType || '普通',
        accountNumber: accountNumber || '',
        accountHolder: accountHolder || ''
      },
      notes: notes || '',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await db.collection('partners').insertOne(newPartner);
    newPartner._id = result.insertedId;

    res.status(201).json({ success: true, data: newPartner });
  } catch (error) {
    console.error('API error - create partner:', error);
    res.status(500).json({ error: 'Failed to create partner' });
  }
});

// PUT /v1/partners/:id - Update a partner
router.put('/partners/:id', async (req, res) => {
  try {
    const db = global.db;
    const partnerId = new ObjectId(req.params.id);

    const existingPartner = await db.collection('partners').findOne({ _id: partnerId });
    if (!existingPartner) {
      return res.status(404).json({ error: 'Partner not found' });
    }

    const updateFields = {};
    const allowedFields = [
      'domain', 'name', 'nameKatakana', 'monthlyAmount', 'paymentCycle',
      'startDate', 'stopDate', 'status', 'email', 'phone', 'address', 'notes', 'order'
    ];
    const bankFields = ['bankName', 'bankBranch', 'accountType', 'accountNumber', 'accountHolder'];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        if (field === 'monthlyAmount') {
          updateFields[field] = parseInt(req.body[field]);
        } else if (field === 'startDate' || field === 'stopDate') {
          updateFields[field] = req.body[field] ? new Date(req.body[field]) : null;
        } else if (field === 'domain') {
          updateFields[field] = cleanDomain(req.body[field]);
        } else {
          updateFields[field] = req.body[field];
        }
      }
    }

    const bankInfo = { ...existingPartner.bankInfo };
    for (const field of bankFields) {
      if (req.body[field] !== undefined) {
        const bankKey = field === 'bankBranch' ? 'branchName' : field;
        bankInfo[bankKey] = req.body[field];
      }
    }
    updateFields.bankInfo = bankInfo;
    updateFields.updatedAt = new Date();

    await db.collection('partners').updateOne({ _id: partnerId }, { $set: updateFields });
    const updated = await db.collection('partners').findOne({ _id: partnerId });

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('API error - update partner:', error);
    res.status(500).json({ error: 'Failed to update partner' });
  }
});

// DELETE /v1/partners/:id - Delete a partner
router.delete('/partners/:id', async (req, res) => {
  try {
    const db = global.db;
    const result = await db.collection('partners').deleteOne({ _id: new ObjectId(req.params.id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Partner not found' });
    }

    res.json({ success: true, message: 'Partner deleted' });
  } catch (error) {
    console.error('API error - delete partner:', error);
    res.status(500).json({ error: 'Failed to delete partner' });
  }
});

// GET /v1/partners/payments/calculate - Calculate partner payments
router.get('/partners/payments/calculate', async (req, res) => {
  try {
    const db = global.db;
    const { period = 'current' } = req.query;

    const periodDates = getCustomMonthPeriod(period === 'previous' ? 1 : 0);
    const { startDate, endDate } = periodDates;

    const partners = await db.collection('partners').find({}).sort({ order: 1 }).toArray();

    const payments = [];
    for (const partner of partners) {
      const calculation = await calculatePartnerPayment(partner, startDate, endDate);
      payments.push({
        partnerId: partner._id,
        domain: partner.domain,
        name: partner.name,
        monthlyAmount: partner.monthlyAmount,
        ...calculation,
        bankInfo: partner.bankInfo
      });
    }

    res.json({
      success: true,
      data: {
        period: {
          name: period,
          startDate: formatLocalDate(startDate),
          endDate: formatLocalDate(endDate)
        },
        payments,
        totalPayment: payments.reduce((sum, p) => sum + p.amount, 0)
      }
    });
  } catch (error) {
    console.error('API error - calculate payments:', error);
    res.status(500).json({ error: 'Failed to calculate payments' });
  }
});

// ============================================================
// PARTNER RECRUITMENT (Applications)
// ============================================================

// GET /v1/partner-requests - List partner recruitment requests
router.get('/partner-requests', async (req, res) => {
  try {
    const db = global.db;
    const { status, limit = 50, offset = 0 } = req.query;

    const filter = {};
    if (status) filter.status = status;

    const requests = await db.collection('partnerRequests')
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit))
      .toArray();

    const total = await db.collection('partnerRequests').countDocuments(filter);

    res.json({
      success: true,
      data: requests,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + requests.length < total
      }
    });
  } catch (error) {
    console.error('API error - list partner requests:', error);
    res.status(500).json({ error: 'Failed to fetch partner requests' });
  }
});

// GET /v1/partner-requests/:id - Get single partner request
router.get('/partner-requests/:id', async (req, res) => {
  try {
    const db = global.db;
    const request = await db.collection('partnerRequests').findOne({ _id: new ObjectId(req.params.id) });

    if (!request) {
      return res.status(404).json({ error: 'Partner request not found' });
    }

    res.json({ success: true, data: request });
  } catch (error) {
    console.error('API error - get partner request:', error);
    res.status(500).json({ error: 'Failed to fetch partner request' });
  }
});

// PUT /v1/partner-requests/:id - Update a partner request
router.put('/partner-requests/:id', async (req, res) => {
  try {
    const db = global.db;
    const { currentStep, status, googleAnalyticsUrl, estimatedMonthlyAmount, notes } = req.body;

    const updateData = { updatedAt: new Date() };
    if (currentStep !== undefined) updateData.currentStep = currentStep;
    if (status !== undefined) updateData.status = status;
    if (googleAnalyticsUrl !== undefined) {
      updateData.googleAnalyticsUrl = googleAnalyticsUrl;
      if (googleAnalyticsUrl) updateData.googleAnalyticsSubmitted = true;
    }
    if (estimatedMonthlyAmount !== undefined) {
      updateData.estimatedMonthlyAmount = estimatedMonthlyAmount ? parseInt(estimatedMonthlyAmount) : null;
    }
    if (notes !== undefined) updateData.notes = notes;

    const result = await db.collection('partnerRequests').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Partner request not found' });
    }

    const updated = await db.collection('partnerRequests').findOne({ _id: new ObjectId(req.params.id) });
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('API error - update partner request:', error);
    res.status(500).json({ error: 'Failed to update partner request' });
  }
});

// POST /v1/partner-requests/:id/approve - Approve a partner request
router.post('/partner-requests/:id/approve', async (req, res) => {
  try {
    const db = global.db;
    const result = await db.collection('partnerRequests').updateOne(
      { _id: new ObjectId(req.params.id) },
      {
        $set: {
          status: 'approved',
          currentStep: 'snippet_verified',
          snippetVerified: true,
          updatedAt: new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Partner request not found' });
    }

    res.json({ success: true, message: 'Partner request approved' });
  } catch (error) {
    console.error('API error - approve partner request:', error);
    res.status(500).json({ error: 'Failed to approve partner request' });
  }
});

// POST /v1/partner-requests/:id/reject - Reject a partner request
router.post('/partner-requests/:id/reject', async (req, res) => {
  try {
    const db = global.db;
    const { reason } = req.body;

    const result = await db.collection('partnerRequests').updateOne(
      { _id: new ObjectId(req.params.id) },
      {
        $set: {
          status: 'rejected',
          currentStep: 'rejected',
          rejectionReason: reason || '',
          updatedAt: new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Partner request not found' });
    }

    res.json({ success: true, message: 'Partner request rejected' });
  } catch (error) {
    console.error('API error - reject partner request:', error);
    res.status(500).json({ error: 'Failed to reject partner request' });
  }
});

// ============================================================
// REFERRAL POPUPS
// ============================================================

// GET /v1/popups - List all referral popups
router.get('/popups', async (req, res) => {
  try {
    const db = global.db;
    const popups = await db.collection('referalPopups').find({}).sort({ order: 1 }).toArray();

    const result = popups.map(p => {
      const refery = (p.refery && Array.isArray(p.refery)) ? p.refery : [];
      const recent = refery.filter(r => r && r.timestamp && r.timestamp >= Date.now() - 24 * 60 * 60 * 1000);
      const views24h = recent.reduce((sum, r) => sum + (r.view || 0), 0);
      const clicks24h = recent.reduce((sum, r) => sum + (r.click || 0), 0);
      return {
        _id: p._id,
        popup: p.popup,
        imageUrl: p.imageUrl,
        targetUrl: p.targetUrl,
        order: p.order,
        views24h,
        clicks24h
      };
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('API error - list popups:', error);
    res.status(500).json({ error: 'Failed to fetch popups' });
  }
});

// ============================================================
// HELPER FUNCTIONS (shared with partners router)
// ============================================================

function cleanDomain(domain) {
  if (!domain) return '';
  let cleaned = domain.replace(/^https?:\/\//, '');
  cleaned = cleaned.replace(/^www\./, '');
  cleaned = cleaned.replace(/\/$/, '');
  return cleaned;
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCustomMonthPeriod(monthsBack = 0) {
  const now = new Date();
  if (monthsBack === 0) {
    if (now.getDate() < 21) {
      const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 21);
      const endDate = new Date(now.getFullYear(), now.getMonth(), 20, 23, 59, 59, 999);
      return { startDate, endDate };
    } else {
      const startDate = new Date(now.getFullYear(), now.getMonth(), 21);
      const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 20, 23, 59, 59, 999);
      return { startDate, endDate };
    }
  } else {
    let targetDate = new Date(now);
    if (now.getDate() < 21) {
      targetDate = new Date(now.getFullYear(), now.getMonth() - monthsBack - 1, 21);
    } else {
      targetDate = new Date(now.getFullYear(), now.getMonth() - monthsBack, 21);
    }
    const startDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 21);
    const endDate = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 20, 23, 59, 59, 999);
    return { startDate, endDate };
  }
}

async function countActiveDaysFromAnalytics(domain, periodStart, periodEnd) {
  const db = global.db;
  const analyticsData = await db.collection('analyticsDaily').find({
    date: {
      $gte: formatLocalDate(periodStart),
      $lte: formatLocalDate(periodEnd)
    }
  }).sort({ date: 1 }).toArray();

  let activeDays = 0;
  for (const dayData of analyticsData) {
    if (dayData.sites && dayData.sites[domain]) {
      const siteData = dayData.sites[domain];
      if ((siteData.views && siteData.views > 0) || (siteData.clicks && siteData.clicks > 0)) {
        activeDays++;
      }
    }
  }
  return activeDays;
}

async function calculatePartnerPayment(partner, periodStart, periodEnd) {
  const startDate = new Date(partner.startDate);
  const stopDate = partner.stopDate ? new Date(partner.stopDate) : null;
  const partnerStatus = partner.status || (stopDate ? 'stopped' : 'active');
  const monthlyRate = partner.monthlyAmount || 0;

  if (['stopped', 'inactive', 'pending'].includes(partnerStatus)) {
    return { amount: 0, daysActive: 0, totalDays: 0, status: partnerStatus };
  }
  if (startDate > periodEnd) {
    return { amount: 0, daysActive: 0, totalDays: 0, status: 'not_started' };
  }
  if (stopDate && stopDate < periodStart) {
    return { amount: 0, daysActive: 0, totalDays: 0, status: 'stopped' };
  }

  const effectiveStart = startDate > periodStart ? startDate : periodStart;
  const effectiveEnd = stopDate && stopDate < periodEnd ? stopDate : periodEnd;

  const startMidnight = new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate());
  const endMidnight = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), periodEnd.getDate());
  const totalDays = Math.round((endMidnight - startMidnight) / (1000 * 60 * 60 * 24)) + 1;

  const daysActive = await countActiveDaysFromAnalytics(partner.domain, effectiveStart, effectiveEnd);
  const dailyRate = monthlyRate / totalDays;
  const amount = Math.round(dailyRate * daysActive);

  let status = 'active';
  if (daysActive < totalDays) status = 'partial';
  if (stopDate && stopDate <= periodEnd) status = 'stopped';

  return { amount, daysActive, totalDays, status, dailyRate: Math.round(dailyRate) };
}

module.exports = router;
