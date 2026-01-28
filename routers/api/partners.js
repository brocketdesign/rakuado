const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

// Helper function to format date as YYYY-MM-DD in local timezone
const formatLocalDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper function to get custom month period dates (21st to 20th)
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

// Helper function to count active days from analytics data
async function countActiveDaysFromAnalytics(domain, periodStart, periodEnd) {
  const db = global.db;
  const ANALYTICS_DAILY = db.collection('analyticsDaily');
  
  // Format date as YYYY-MM-DD in local timezone (avoid toISOString which uses UTC)
  const formatLocalDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  // Get analytics data for the period
  const analyticsData = await ANALYTICS_DAILY.find({
    date: {
      $gte: formatLocalDate(periodStart),
      $lte: formatLocalDate(periodEnd)
    }
  }).sort({ date: 1 }).toArray();
  
  let activeDays = 0;
  
  for (const dayData of analyticsData) {
    // Check if this domain has views or clicks for this day
    if (dayData.sites && dayData.sites[domain]) {
      const siteData = dayData.sites[domain];
      // Day is active if there are views > 0 OR clicks > 0
      if ((siteData.views && siteData.views > 0) || (siteData.clicks && siteData.clicks > 0)) {
        activeDays++;
      }
    }
  }
  
  return activeDays;
}

// Calculate payment for a partner based on their start date, stop date, status, and monthly rate
async function calculatePartnerPayment(partner, periodStart, periodEnd) {
  const startDate = new Date(partner.startDate);
  const stopDate = partner.stopDate ? new Date(partner.stopDate) : null;
  const partnerStatus = partner.status || (stopDate ? 'stopped' : 'active');
  const monthlyRate = partner.monthlyAmount || 0;
  
  // If partner status is stopped, inactive, or pending, no payment
  if (partnerStatus === 'stopped' || partnerStatus === 'inactive' || partnerStatus === 'pending') {
    return { amount: 0, daysActive: 0, totalDays: 0, status: partnerStatus };
  }
  
  // If partner started after period end, no payment
  if (startDate > periodEnd) {
    return { amount: 0, daysActive: 0, totalDays: 0, status: 'not_started' };
  }
  
  // If partner stopped before period start, no payment
  if (stopDate && stopDate < periodStart) {
    return { amount: 0, daysActive: 0, totalDays: 0, status: 'stopped' };
  }
  
  // Calculate the effective start and end dates within the period
  const effectiveStart = startDate > periodStart ? startDate : periodStart;
  const effectiveEnd = stopDate && stopDate < periodEnd ? stopDate : periodEnd;
  
  // Calculate total days in period (normalize to midnight to avoid time component issues)
  const startMidnight = new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate());
  const endMidnight = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), periodEnd.getDate());
  const totalDays = Math.round((endMidnight - startMidnight) / (1000 * 60 * 60 * 24)) + 1;
  
  // Get actual active days from analytics data (dynamic check)
  const daysActiveFromAnalytics = await countActiveDaysFromAnalytics(partner.domain, effectiveStart, effectiveEnd);
  
  // Use analytics-based active days (daysActiveFromAnalytics) instead of calendar days
  const daysActive = daysActiveFromAnalytics;
  
  // Calculate prorated payment based on active days
  const dailyRate = monthlyRate / totalDays;
  const amount = Math.round(dailyRate * daysActive);
  
  let status = 'active';
  if (daysActive < totalDays) {
    status = 'partial';
  }
  if (stopDate && stopDate <= periodEnd) {
    status = 'stopped';
  }
  
  return { amount, daysActive, totalDays, status, dailyRate: Math.round(dailyRate) };
}

// GET all partners
router.get('/', async (req, res) => {
  try {
    const db = global.db;
    const partners = await db.collection('partners').find({}).sort({ order: 1 }).toArray();
    res.json({ success: true, partners });
  } catch (error) {
    console.error('Error fetching partners:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch partners' });
  }
});

// GET single partner by ID
router.get('/:id', async (req, res) => {
  try {
    const db = global.db;
    const partner = await db.collection('partners').findOne({ _id: new ObjectId(req.params.id) });
    
    if (!partner) {
      return res.status(404).json({ success: false, error: 'Partner not found' });
    }
    
    res.json({ success: true, partner });
  } catch (error) {
    console.error('Error fetching partner:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch partner' });
  }
});

// Helper function to clean domain
function cleanDomain(domain) {
  if (!domain) return '';
  // Remove http:// or https://
  let cleaned = domain.replace(/^https?:\/\//, '');
  // Remove www. prefix
  cleaned = cleaned.replace(/^www\./, '');
  // Remove trailing slash
  cleaned = cleaned.replace(/\/$/, '');
  return cleaned;
}

// POST create new partner
router.post('/', async (req, res) => {
  try {
    const db = global.db;
    const {
      domain,
      name,
      nameKatakana,
      monthlyAmount,
      paymentCycle,
      startDate,
      stopDate,
      email,
      phone,
      address,
      bankName,
      bankBranch,
      accountType,
      accountNumber,
      accountHolder,
      notes
    } = req.body;
    
    // Validation
    if (!domain || !name || !monthlyAmount || !startDate) {
      return res.status(400).json({ 
        success: false, 
        error: 'Required fields: domain, name, monthlyAmount, startDate' 
      });
    }
    
    // Get the next order number
    const lastPartner = await db.collection('partners').findOne({}, { sort: { order: -1 } });
    const order = lastPartner ? (lastPartner.order || 0) + 1 : 1;
    
    // Clean domain
    const cleanedDomain = cleanDomain(domain);
    
    const newPartner = {
      order,
      domain: cleanedDomain,
      name,
      nameKatakana: nameKatakana || '',
      monthlyAmount: parseInt(monthlyAmount),
      paymentCycle: paymentCycle || '当月', // 当月 or 翌月
      startDate: new Date(startDate),
      stopDate: stopDate ? new Date(stopDate) : null,
      status: req.body.status || (stopDate ? 'stopped' : 'active'), // active, stopped, pending, inactive
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
    
    res.status(201).json({ 
      success: true, 
      message: 'Partner created successfully',
      partner: newPartner 
    });
  } catch (error) {
    console.error('Error creating partner:', error);
    res.status(500).json({ success: false, error: 'Failed to create partner' });
  }
});

// PUT update partner
router.put('/:id', async (req, res) => {
  try {
    const db = global.db;
    const partnerId = new ObjectId(req.params.id);
    
    const existingPartner = await db.collection('partners').findOne({ _id: partnerId });
    if (!existingPartner) {
      return res.status(404).json({ success: false, error: 'Partner not found' });
    }
    
    const updateFields = {};
    const allowedFields = [
      'domain', 'name', 'nameKatakana', 'monthlyAmount', 'paymentCycle',
      'startDate', 'stopDate', 'status', 'email', 'phone', 'address', 'notes', 'order'
    ];
    const bankFields = ['bankName', 'bankBranch', 'accountType', 'accountNumber', 'accountHolder'];
    
    // Update regular fields
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        if (field === 'monthlyAmount') {
          updateFields[field] = parseInt(req.body[field]);
        } else if (field === 'startDate' || field === 'stopDate') {
          updateFields[field] = req.body[field] ? new Date(req.body[field]) : null;
        } else if (field === 'domain') {
          // Clean domain when updating
          updateFields[field] = cleanDomain(req.body[field]);
        } else {
          updateFields[field] = req.body[field];
        }
      }
    }
    
    // Update bank info fields
    const bankInfo = { ...existingPartner.bankInfo };
    for (const field of bankFields) {
      if (req.body[field] !== undefined) {
        const bankKey = field === 'bankBranch' ? 'branchName' : field;
        bankInfo[bankKey] = req.body[field];
      }
    }
    updateFields.bankInfo = bankInfo;
    updateFields.updatedAt = new Date();
    
    await db.collection('partners').updateOne(
      { _id: partnerId },
      { $set: updateFields }
    );
    
    const updatedPartner = await db.collection('partners').findOne({ _id: partnerId });
    
    res.json({ 
      success: true, 
      message: 'Partner updated successfully',
      partner: updatedPartner 
    });
  } catch (error) {
    console.error('Error updating partner:', error);
    res.status(500).json({ success: false, error: 'Failed to update partner' });
  }
});

// DELETE partner
router.delete('/:id', async (req, res) => {
  try {
    const db = global.db;
    const partnerId = new ObjectId(req.params.id);
    
    const result = await db.collection('partners').deleteOne({ _id: partnerId });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, error: 'Partner not found' });
    }
    
    res.json({ success: true, message: 'Partner deleted successfully' });
  } catch (error) {
    console.error('Error deleting partner:', error);
    res.status(500).json({ success: false, error: 'Failed to delete partner' });
  }
});

// GET payment calculations for all partners
router.get('/payments/calculate', async (req, res) => {
  try {
    const db = global.db;
    const { period = 'current' } = req.query;
    
    let periodDates;
    switch (period) {
      case 'current':
        periodDates = getCustomMonthPeriod(0);
        break;
      case 'previous':
        periodDates = getCustomMonthPeriod(1);
        break;
      default:
        return res.status(400).json({ success: false, error: 'Invalid period' });
    }
    
    const { startDate, endDate } = periodDates;
    const partners = await db.collection('partners').find({}).sort({ order: 1 }).toArray();
    
    // Get payment confirmations for this period
    const periodKey = `${formatLocalDate(startDate)}_${formatLocalDate(endDate)}`;
    const confirmationCollection = db.collection('partnerPaymentConfirmations');
    const confirmations = await confirmationCollection.find({ periodKey }).toArray();
    const confirmationMap = {};
    confirmations.forEach(c => {
      confirmationMap[c.partnerId.toString()] = c.confirmed;
    });
    
    const payments = [];
    for (const partner of partners) {
      const calculation = await calculatePartnerPayment(partner, startDate, endDate);
      payments.push({
        partnerId: partner._id,
        domain: partner.domain,
        name: partner.name,
        nameKatakana: partner.nameKatakana,
        monthlyAmount: partner.monthlyAmount,
        paymentCycle: partner.paymentCycle,
        ...calculation,
        bankInfo: partner.bankInfo,
        paymentConfirmed: confirmationMap[partner._id.toString()] || false
      });
    }
    
    const totalPayment = payments.reduce((sum, p) => sum + p.amount, 0);
    
    res.json({
      success: true,
      period: {
        name: period,
        startDate: formatLocalDate(startDate),
        endDate: formatLocalDate(endDate)
      },
      payments,
      totalPayment
    });
  } catch (error) {
    console.error('Error calculating payments:', error);
    res.status(500).json({ success: false, error: 'Failed to calculate payments' });
  }
});

// GET payment history/projection for multiple periods
router.get('/payments/history', async (req, res) => {
  try {
    const db = global.db;
    const { months = 6 } = req.query;
    const numMonths = parseInt(months);
    
    const partners = await db.collection('partners').find({}).sort({ order: 1 }).toArray();
    const periods = [];
    
    for (let i = 0; i < numMonths; i++) {
      const { startDate, endDate } = getCustomMonthPeriod(i);
      const periodName = startDate.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' });
      
      const payments = [];
      for (const partner of partners) {
        const calculation = await calculatePartnerPayment(partner, startDate, endDate);
        payments.push({
          partnerId: partner._id,
          domain: partner.domain,
          name: partner.name,
          amount: calculation.amount,
          status: calculation.status
        });
      }
      
      const total = payments.reduce((sum, p) => sum + p.amount, 0);
      
      periods.push({
        periodName,
        startDate: formatLocalDate(startDate),
        endDate: formatLocalDate(endDate),
        payments,
        total
      });
    }
    
    res.json({ success: true, periods });
  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch payment history' });
  }
});

// PUBLIC API - Get partner payment summary (no auth required)
router.get('/public/summary', async (req, res) => {
  try {
    const db = global.db;
    const { period = 'current' } = req.query;
    
    let periodDates;
    switch (period) {
      case 'current':
        periodDates = getCustomMonthPeriod(0);
        break;
      case 'previous':
        periodDates = getCustomMonthPeriod(1);
        break;
      default:
        return res.status(400).json({ error: 'Invalid period. Use "current" or "previous"' });
    }
    
    const { startDate, endDate } = periodDates;
    // Get active partners (status is active or null, and no stop date)
    const partners = await db.collection('partners').find({ 
      $or: [
        { status: 'active' },
        { status: { $exists: false }, stopDate: null },
        { status: null, stopDate: null }
      ]
    }).sort({ order: 1 }).toArray();
    
    const summary = [];
    for (const partner of partners) {
      const calculation = await calculatePartnerPayment(partner, startDate, endDate);
      summary.push({
        domain: partner.domain,
        name: partner.name,
        period: {
          start: formatLocalDate(startDate),
          end: formatLocalDate(endDate)
        },
        monthlyPrice: partner.monthlyAmount,
        expectedPayment: calculation.amount,
        daysActive: calculation.daysActive,
        totalDaysInPeriod: calculation.totalDays,
        status: calculation.status
      });
    }
    
    res.json({
      period: period,
      periodDates: {
        start: formatLocalDate(startDate),
        end: formatLocalDate(endDate)
      },
      partners: summary,
      totalExpectedPayment: summary.reduce((sum, p) => sum + p.expectedPayment, 0)
    });
  } catch (error) {
    console.error('Public API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST endpoint to manually recalculate active days for all partners
router.post('/payments/recalculate', async (req, res) => {
  try {
    const db = global.db;
    const { period = 'current' } = req.body;
    
    let periodDates;
    switch (period) {
      case 'current':
        periodDates = getCustomMonthPeriod(0);
        break;
      case 'previous':
        periodDates = getCustomMonthPeriod(1);
        break;
      default:
        return res.status(400).json({ success: false, error: 'Invalid period' });
    }
    
    const { startDate, endDate } = periodDates;
    const partners = await db.collection('partners').find({}).sort({ order: 1 }).toArray();
    
    const results = [];
    for (const partner of partners) {
      const calculation = await calculatePartnerPayment(partner, startDate, endDate);
      results.push({
        partnerId: partner._id,
        domain: partner.domain,
        name: partner.name,
        daysActive: calculation.daysActive,
        amount: calculation.amount
      });
    }
    
    res.json({
      success: true,
      message: 'Active days recalculated successfully',
      period: {
        name: period,
        startDate: formatLocalDate(startDate),
        endDate: formatLocalDate(endDate)
      },
      results
    });
  } catch (error) {
    console.error('Error recalculating payments:', error);
    res.status(500).json({ success: false, error: 'Failed to recalculate payments' });
  }
});

// POST endpoint to confirm/unconfirm a payment for a partner in a period
router.post('/payments/confirm', async (req, res) => {
  try {
    const db = global.db;
    const { partnerId, periodKey, confirmed } = req.body;
    
    if (!partnerId || !periodKey) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    
    const confirmationCollection = db.collection('partnerPaymentConfirmations');
    
    if (confirmed) {
      // Upsert the confirmation record
      await confirmationCollection.updateOne(
        { partnerId: new ObjectId(partnerId), periodKey },
        { 
          $set: { 
            partnerId: new ObjectId(partnerId),
            periodKey,
            confirmed: true,
            confirmedAt: new Date()
          }
        },
        { upsert: true }
      );
    } else {
      // Remove the confirmation record
      await confirmationCollection.deleteOne({
        partnerId: new ObjectId(partnerId),
        periodKey
      });
    }
    
    res.json({ success: true, confirmed });
  } catch (error) {
    console.error('Error confirming payment:', error);
    res.status(500).json({ success: false, error: 'Failed to confirm payment' });
  }
});

// GET endpoint to get payment confirmations for a period
router.get('/payments/confirmations', async (req, res) => {
  try {
    const db = global.db;
    const { periodKey } = req.query;
    
    if (!periodKey) {
      return res.status(400).json({ success: false, error: 'Missing periodKey' });
    }
    
    const confirmationCollection = db.collection('partnerPaymentConfirmations');
    const confirmations = await confirmationCollection.find({ periodKey }).toArray();
    
    // Return a map of partnerId -> confirmed status
    const confirmationMap = {};
    confirmations.forEach(c => {
      confirmationMap[c.partnerId.toString()] = c.confirmed;
    });
    
    res.json({ success: true, confirmations: confirmationMap });
  } catch (error) {
    console.error('Error fetching payment confirmations:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch payment confirmations' });
  }
});

module.exports = router;
