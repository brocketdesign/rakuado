const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { sendEmail, sendEmailBatch } = require('../../services/email');
const { 
  getCustomMonthPeriod, 
  countActiveDaysFromAnalytics, 
  calculatePartnerPayment 
} = require('../../utils/partner-payment');

// Helper function to format date as YYYY-MM-DD in local timezone
const formatLocalDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

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
      periodStart: formatLocalDate(startDate),
      periodEnd: formatLocalDate(endDate)
    }).sort({ createdAt: -1 }).toArray();
    
    res.json({
      success: true,
      period: {
        name: period,
        startDate: formatLocalDate(startDate),
        endDate: formatLocalDate(endDate)
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
    const periodStartStr = formatLocalDate(startDate);
    const periodEndStr = formatLocalDate(endDate);
    
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
      const calculation = await calculatePartnerPayment(db, partner, startDate, endDate);
      
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

// POST send multiple emails in batch (with rate limiting)
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
    
    const preCheckResults = {
      valid: [],
      skipped: [],
      failed: []
    };
    
    // Pre-check all drafts before sending
    for (const draftIdStr of draftIds) {
      const draftId = new ObjectId(draftIdStr);
      const draft = await db.collection('partnerEmailDrafts').findOne({ _id: draftId });
      
      if (!draft) {
        preCheckResults.failed.push({ 
          draftId: draftIdStr, 
          error: 'Draft not found' 
        });
        continue;
      }
      
      // Skip if already sent
      if (draft.status === 'sent') {
        preCheckResults.skipped.push({ 
          draftId: draftIdStr, 
          partnerName: draft.partnerName,
          reason: 'Already sent' 
        });
        continue;
      }
      
      // Skip if no data
      if (!draft.hasData) {
        preCheckResults.skipped.push({ 
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
        preCheckResults.failed.push({ 
          draftId: draftIdStr, 
          partnerName: draft.partnerName,
          error: 'Partner email not configured' 
        });
        continue;
      }
      
      // Add to valid emails list
      preCheckResults.valid.push({
        draftId: draftIdStr,
        draft,
        emailData: {
          toEmail: draft.partnerEmail,
          template: 'partner payment notification',
          locals: {
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
          }
        }
      });
    }
    
    // Send emails with rate limiting (2 per second)
    const emailsToSend = preCheckResults.valid.map(v => v.emailData);
    const batchResults = await sendEmailBatch(emailsToSend, (progress) => {
      console.log(`[Batch Progress] ${progress.current}/${progress.total} - ${progress.status} to ${progress.toEmail}`);
    });
    
    // Update database based on results
    const finalResults = {
      sent: [],
      failed: [...preCheckResults.failed],
      skipped: [...preCheckResults.skipped]
    };
    
    // Process successful sends
    for (const sentItem of batchResults.sent) {
      const validItem = preCheckResults.valid.find(v => v.emailData.toEmail === sentItem.toEmail);
      if (validItem) {
        await db.collection('partnerEmailDrafts').updateOne(
          { _id: new ObjectId(validItem.draftId) },
          { 
            $set: { 
              status: 'sent',
              sentAt: new Date(),
              errorMessage: null,
              updatedAt: new Date()
            }
          }
        );
        finalResults.sent.push({
          draftId: validItem.draftId,
          partnerName: validItem.draft.partnerName
        });
      }
    }
    
    // Process failed sends
    for (const failedItem of batchResults.failed) {
      const validItem = preCheckResults.valid.find(v => v.emailData.toEmail === failedItem.toEmail);
      if (validItem) {
        await db.collection('partnerEmailDrafts').updateOne(
          { _id: new ObjectId(validItem.draftId) },
          { 
            $set: { 
              status: 'error',
              errorMessage: failedItem.error,
              updatedAt: new Date()
            }
          }
        );
        finalResults.failed.push({
          draftId: validItem.draftId,
          partnerName: validItem.draft.partnerName,
          error: failedItem.error
        });
      }
    }
    
    res.json({
      success: true,
      message: `Batch email sending completed. Sent: ${finalResults.sent.length}, Failed: ${finalResults.failed.length}, Skipped: ${finalResults.skipped.length}`,
      results: finalResults
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

// POST send test email to verify email configuration
router.post('/send-test', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email address is required' 
      });
    }
    
    // Sample data for test email
    const testData = {
      partnerName: 'テストパートナー',
      domain: 'test-domain.com',
      periodStart: '2026-01-21',
      periodEnd: '2026-02-20',
      periodMonth: '2026年2月',
      paymentCycle: '当月',
      monthlyAmount: '10,000',
      totalDays: 31,
      activeDays: 28,
      inactiveDays: 3,
      paymentAmount: '9,032',
      bankInfo: {
        bankName: 'テスト銀行',
        branchName: 'テスト支店',
        accountType: '普通',
        accountNumber: '1234567',
        accountHolder: 'テスト タロウ'
      },
      notes: 'これはテストメールです。実際の支払いではありません。'
    };
    
    // Get the from email from environment
    const fromEmail = process.env.MAILTRAP_FROM_EMAIL || process.env.MAIL_TRAP_USERNAME || 'noreply@rakuado.com';
    const fromName = process.env.PRODUCT_NAME || 'Rakuado';
    
    await sendEmail(email, 'partner payment notification', testData);
    
    res.json({
      success: true,
      message: 'Test email sent successfully',
      fromEmail,
      fromName
    });
  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to send test email' 
    });
  }
});

module.exports = router;
