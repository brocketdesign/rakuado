const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { sendEmail } = require('../../services/email');

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
  
  // Get analytics data for the period
  const analyticsData = await ANALYTICS_DAILY.find({
    date: {
      $gte: periodStart.toISOString().split('T')[0],
      $lte: periodEnd.toISOString().split('T')[0]
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
async function calculatePartnerPayment(partner, periodStart, periodEnd, customInactiveDays = null) {
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
  
  // Calculate total days in period
  const totalDays = Math.ceil((periodEnd - periodStart) / (1000 * 60 * 60 * 24)) + 1;
  
  // Get actual active days from analytics data (dynamic check)
  const daysActiveFromAnalytics = await countActiveDaysFromAnalytics(partner.domain, effectiveStart, effectiveEnd);
  
  // Use custom inactive days if provided
  let daysActive;
  if (customInactiveDays !== null && customInactiveDays !== undefined) {
    daysActive = totalDays - customInactiveDays;
  } else {
    daysActive = daysActiveFromAnalytics;
  }
  
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
  
  return { 
    amount, 
    daysActive, 
    totalDays, 
    status, 
    dailyRate: Math.round(dailyRate),
    inactiveDays: totalDays - daysActive
  };
}

// GET all email drafts with their status
router.get('/drafts', async (req, res) => {
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
    
    // Get all drafts for the period
    const drafts = await db.collection('partnerEmailDrafts').find({
      periodStart: startDate.toISOString().split('T')[0],
      periodEnd: endDate.toISOString().split('T')[0]
    }).sort({ createdAt: -1 }).toArray();
    
    res.json({
      success: true,
      period: {
        name: period,
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
      },
      drafts
    });
  } catch (error) {
    console.error('Error fetching email drafts:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch email drafts' });
  }
});

// GET specific email draft
router.get('/draft/:draftId', async (req, res) => {
  try {
    const db = global.db;
    const draft = await db.collection('partnerEmailDrafts').findOne({ 
      _id: new ObjectId(req.params.draftId) 
    });
    
    if (!draft) {
      return res.status(404).json({ success: false, error: 'Draft not found' });
    }
    
    res.json({ success: true, draft });
  } catch (error) {
    console.error('Error fetching email draft:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch email draft' });
  }
});

// POST generate email drafts for all partners in the period
router.post('/generate', async (req, res) => {
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
    const periodStartStr = startDate.toISOString().split('T')[0];
    const periodEndStr = endDate.toISOString().split('T')[0];
    
    // Get all active partners
    const partners = await db.collection('partners').find({}).sort({ order: 1 }).toArray();
    
    const draftsCreated = [];
    const draftsSkipped = [];
    const draftsUpdated = [];
    
    for (const partner of partners) {
      // Check if draft already exists for this partner and period
      const existingDraft = await db.collection('partnerEmailDrafts').findOne({
        partnerId: partner._id.toString(),
        periodStart: periodStartStr,
        periodEnd: periodEndStr
      });
      
      if (existingDraft && existingDraft.status === 'sent') {
        draftsSkipped.push({
          partnerId: partner._id,
          partnerName: partner.name,
          reason: 'Already sent'
        });
        continue;
      }
      
      // Calculate payment
      const calculation = await calculatePartnerPayment(partner, startDate, endDate);
      
      // Check if there's data available (if activeDays > 0 or if partner was active)
      const hasData = calculation.daysActive > 0 || calculation.status === 'active' || calculation.status === 'partial';
      
      const periodMonth = startDate.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' });
      
      const emailData = {
        partnerId: partner._id.toString(),
        partnerName: partner.name,
        partnerEmail: partner.email,
        domain: partner.domain,
        periodStart: periodStartStr,
        periodEnd: periodEndStr,
        periodMonth: periodMonth,
        paymentCycle: partner.paymentCycle || '当月',
        monthlyAmount: partner.monthlyAmount,
        totalDays: calculation.totalDays,
        activeDays: calculation.daysActive,
        inactiveDays: calculation.inactiveDays,
        paymentAmount: calculation.amount,
        bankInfo: partner.bankInfo || {},
        notes: partner.notes || '',
        status: existingDraft ? existingDraft.status : (hasData ? 'draft' : 'no_data'),
        hasData: hasData,
        errorMessage: hasData ? null : 'No analytics data available for this period',
        createdAt: existingDraft ? existingDraft.createdAt : new Date(),
        updatedAt: new Date()
      };
      
      if (existingDraft) {
        // Update existing draft
        await db.collection('partnerEmailDrafts').updateOne(
          { _id: existingDraft._id },
          { $set: emailData }
        );
        draftsUpdated.push({
          partnerId: partner._id,
          partnerName: partner.name,
          draftId: existingDraft._id
        });
      } else {
        // Create new draft
        const result = await db.collection('partnerEmailDrafts').insertOne(emailData);
        draftsCreated.push({
          partnerId: partner._id,
          partnerName: partner.name,
          draftId: result.insertedId
        });
      }
    }
    
    res.json({
      success: true,
      message: 'Email drafts generated successfully',
      period: {
        name: period,
        startDate: periodStartStr,
        endDate: periodEndStr
      },
      summary: {
        created: draftsCreated.length,
        updated: draftsUpdated.length,
        skipped: draftsSkipped.length
      },
      draftsCreated,
      draftsUpdated,
      draftsSkipped
    });
  } catch (error) {
    console.error('Error generating email drafts:', error);
    res.status(500).json({ success: false, error: 'Failed to generate email drafts' });
  }
});

// PUT update email draft (e.g., update inactive days)
router.put('/draft/:draftId', async (req, res) => {
  try {
    const db = global.db;
    const draftId = new ObjectId(req.params.draftId);
    const { inactiveDays, notes } = req.body;
    
    const draft = await db.collection('partnerEmailDrafts').findOne({ _id: draftId });
    
    if (!draft) {
      return res.status(404).json({ success: false, error: 'Draft not found' });
    }
    
    // If draft was already sent, don't allow updates
    if (draft.status === 'sent') {
      return res.status(400).json({ 
        success: false, 
        error: 'Cannot update a draft that has already been sent' 
      });
    }
    
    const updateFields = {
      updatedAt: new Date()
    };
    
    // If inactiveDays is provided, recalculate payment
    if (inactiveDays !== undefined && inactiveDays !== null) {
      const newActiveDays = draft.totalDays - inactiveDays;
      const dailyRate = draft.monthlyAmount / draft.totalDays;
      const newPaymentAmount = Math.round(dailyRate * newActiveDays);
      
      updateFields.inactiveDays = parseInt(inactiveDays);
      updateFields.activeDays = newActiveDays;
      updateFields.paymentAmount = newPaymentAmount;
      updateFields.hasData = true;
      updateFields.status = 'draft';
      updateFields.errorMessage = null;
    }
    
    // If notes is provided, update notes
    if (notes !== undefined) {
      updateFields.notes = notes;
    }
    
    await db.collection('partnerEmailDrafts').updateOne(
      { _id: draftId },
      { $set: updateFields }
    );
    
    const updatedDraft = await db.collection('partnerEmailDrafts').findOne({ _id: draftId });
    
    res.json({
      success: true,
      message: 'Draft updated successfully',
      draft: updatedDraft
    });
  } catch (error) {
    console.error('Error updating email draft:', error);
    res.status(500).json({ success: false, error: 'Failed to update email draft' });
  }
});

// POST send specific email
router.post('/send/:draftId', async (req, res) => {
  try {
    const db = global.db;
    const draftId = new ObjectId(req.params.draftId);
    
    const draft = await db.collection('partnerEmailDrafts').findOne({ _id: draftId });
    
    if (!draft) {
      return res.status(404).json({ success: false, error: 'Draft not found' });
    }
    
    // Check if email has already been sent
    if (draft.status === 'sent') {
      return res.status(400).json({ 
        success: false, 
        error: 'Email has already been sent' 
      });
    }
    
    // Check if draft has data
    if (!draft.hasData) {
      return res.status(400).json({ 
        success: false, 
        error: 'Cannot send email without data. Please update inactive days first.' 
      });
    }
    
    // Check if partner has email
    if (!draft.partnerEmail) {
      await db.collection('partnerEmailDrafts').updateOne(
        { _id: draftId },
        { 
          $set: { 
            status: 'error',
            errorMessage: 'Partner email not configured',
            updatedAt: new Date()
          }
        }
      );
      return res.status(400).json({ 
        success: false, 
        error: 'Partner email not configured' 
      });
    }
    
    try {
      // Send email
      await sendEmail(draft.partnerEmail, 'partner payment notification', {
        partnerName: draft.partnerName,
        domain: draft.domain,
        periodStart: draft.periodStart,
        periodEnd: draft.periodEnd,
        periodMonth: draft.periodMonth,
        paymentCycle: draft.paymentCycle,
        monthlyAmount: draft.monthlyAmount.toLocaleString('ja-JP'),
        totalDays: draft.totalDays,
        activeDays: draft.activeDays,
        inactiveDays: draft.inactiveDays,
        paymentAmount: draft.paymentAmount.toLocaleString('ja-JP'),
        bankInfo: draft.bankInfo,
        notes: draft.notes
      });
      
      // Mark as sent
      await db.collection('partnerEmailDrafts').updateOne(
        { _id: draftId },
        { 
          $set: { 
            status: 'sent',
            sentAt: new Date(),
            errorMessage: null,
            updatedAt: new Date()
          }
        }
      );
      
      res.json({
        success: true,
        message: 'Email sent successfully',
        draft: await db.collection('partnerEmailDrafts').findOne({ _id: draftId })
      });
    } catch (emailError) {
      // Mark as error
      await db.collection('partnerEmailDrafts').updateOne(
        { _id: draftId },
        { 
          $set: { 
            status: 'error',
            errorMessage: emailError.message,
            updatedAt: new Date()
          }
        }
      );
      
      throw emailError;
    }
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to send email' });
  }
});

// POST send multiple emails in batch
router.post('/send-batch', async (req, res) => {
  try {
    const db = global.db;
    const { draftIds } = req.body;
    
    if (!draftIds || !Array.isArray(draftIds) || draftIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'draftIds array is required' 
      });
    }
    
    const results = {
      sent: [],
      failed: [],
      skipped: []
    };
    
    for (const draftIdStr of draftIds) {
      const draftId = new ObjectId(draftIdStr);
      const draft = await db.collection('partnerEmailDrafts').findOne({ _id: draftId });
      
      if (!draft) {
        results.failed.push({ 
          draftId: draftIdStr, 
          error: 'Draft not found' 
        });
        continue;
      }
      
      // Skip if already sent
      if (draft.status === 'sent') {
        results.skipped.push({ 
          draftId: draftIdStr, 
          partnerName: draft.partnerName,
          reason: 'Already sent' 
        });
        continue;
      }
      
      // Skip if no data
      if (!draft.hasData) {
        results.skipped.push({ 
          draftId: draftIdStr, 
          partnerName: draft.partnerName,
          reason: 'No data available' 
        });
        continue;
      }
      
      // Skip if no email
      if (!draft.partnerEmail) {
        await db.collection('partnerEmailDrafts').updateOne(
          { _id: draftId },
          { 
            $set: { 
              status: 'error',
              errorMessage: 'Partner email not configured',
              updatedAt: new Date()
            }
          }
        );
        results.failed.push({ 
          draftId: draftIdStr, 
          partnerName: draft.partnerName,
          error: 'Partner email not configured' 
        });
        continue;
      }
      
      try {
        // Send email
        await sendEmail(draft.partnerEmail, 'partner payment notification', {
          partnerName: draft.partnerName,
          domain: draft.domain,
          periodStart: draft.periodStart,
          periodEnd: draft.periodEnd,
          periodMonth: draft.periodMonth,
          paymentCycle: draft.paymentCycle,
          monthlyAmount: draft.monthlyAmount.toLocaleString('ja-JP'),
          totalDays: draft.totalDays,
          activeDays: draft.activeDays,
          inactiveDays: draft.inactiveDays,
          paymentAmount: draft.paymentAmount.toLocaleString('ja-JP'),
          bankInfo: draft.bankInfo,
          notes: draft.notes
        });
        
        // Mark as sent
        await db.collection('partnerEmailDrafts').updateOne(
          { _id: draftId },
          { 
            $set: { 
              status: 'sent',
              sentAt: new Date(),
              errorMessage: null,
              updatedAt: new Date()
            }
          }
        );
        
        results.sent.push({ 
          draftId: draftIdStr, 
          partnerName: draft.partnerName 
        });
      } catch (emailError) {
        // Mark as error
        await db.collection('partnerEmailDrafts').updateOne(
          { _id: draftId },
          { 
            $set: { 
              status: 'error',
              errorMessage: emailError.message,
              updatedAt: new Date()
            }
          }
        );
        
        results.failed.push({ 
          draftId: draftIdStr, 
          partnerName: draft.partnerName,
          error: emailError.message 
        });
      }
    }
    
    res.json({
      success: true,
      message: 'Batch email sending completed',
      results
    });
  } catch (error) {
    console.error('Error sending batch emails:', error);
    res.status(500).json({ success: false, error: 'Failed to send batch emails' });
  }
});

// DELETE draft
router.delete('/draft/:draftId', async (req, res) => {
  try {
    const db = global.db;
    const draftId = new ObjectId(req.params.draftId);
    
    const result = await db.collection('partnerEmailDrafts').deleteOne({ _id: draftId });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, error: 'Draft not found' });
    }
    
    res.json({ success: true, message: 'Draft deleted successfully' });
  } catch (error) {
    console.error('Error deleting draft:', error);
    res.status(500).json({ success: false, error: 'Failed to delete draft' });
  }
});

module.exports = router;
