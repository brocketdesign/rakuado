const cron = require('node-cron');
const { 
  getCustomMonthPeriod, 
  countActiveDaysFromAnalytics, 
  calculatePartnerPayment 
} = require('../utils/partner-payment');

async function recalculatePartnerActiveDays(db) {
  const PARTNERS = db.collection('partners');
  const ANALYTICS_DAILY = db.collection('analyticsDaily');
  
  try {
    console.log('Starting partner active days recalculation...');
    
    // Get current period
    const { startDate, endDate } = getCustomMonthPeriod(0);
    
    // Get all partners
    const partners = await PARTNERS.find({}).sort({ order: 1 }).toArray();
    
    let updated = 0;
    
    for (const partner of partners) {
      const partnerStatus = partner.status || (partner.stopDate ? 'stopped' : 'active');
      
      // Skip if partner is stopped, inactive, or pending
      if (partnerStatus === 'stopped' || partnerStatus === 'inactive' || partnerStatus === 'pending') {
        continue;
      }
      
      // Skip if partner started after period end
      const startDateObj = new Date(partner.startDate);
      if (startDateObj > endDate) {
        continue;
      }
      
      // Skip if partner stopped before period start
      const stopDateObj = partner.stopDate ? new Date(partner.stopDate) : null;
      if (stopDateObj && stopDateObj < startDate) {
        continue;
      }
      
      // Calculate effective start and end dates within the period
      const effectiveStart = startDateObj > startDate ? startDateObj : startDate;
      const effectiveEnd = stopDateObj && stopDateObj < endDate ? stopDateObj : endDate;
      
      // Count active days from analytics
      const activeDays = await countActiveDaysFromAnalytics(db, partner.domain, effectiveStart, effectiveEnd);
      
      // Store active days count for current period (optional - can be used for caching)
      // For now, we'll just log it as the calculation is done dynamically
      console.log(`Partner ${partner.domain}: ${activeDays} active days in current period`);
      
      updated++;
    }
    
    console.log(`Partner active days recalculation completed. Processed ${updated} partners.`);
    return { success: true, partnersProcessed: updated };
    
  } catch (error) {
    console.error('Error in partner active days recalculation:', error);
    throw error;
  }
}

// Generate email drafts for all partners
async function generateEmailDrafts(db, period = 'previous') {
  try {
    console.log(`Starting email draft generation for ${period} period...`);
    
    let periodDates;
    switch (period) {
      case 'current':
        periodDates = getCustomMonthPeriod(0);
        break;
      case 'previous':
        periodDates = getCustomMonthPeriod(1);
        break;
      default:
        throw new Error('Invalid period');
    }
    
    const { startDate, endDate } = periodDates;
    const periodStartStr = startDate.toISOString().split('T')[0];
    const periodEndStr = endDate.toISOString().split('T')[0];
    
    // Get all active partners
    const partners = await db.collection('partners').find({}).sort({ order: 1 }).toArray();
    
    let created = 0;
    let updated = 0;
    let skipped = 0;
    
    for (const partner of partners) {
      // Check if draft already exists for this partner and period
      const existingDraft = await db.collection('partnerEmailDrafts').findOne({
        partnerId: partner._id.toString(),
        periodStart: periodStartStr,
        periodEnd: periodEndStr
      });
      
      if (existingDraft && existingDraft.status === 'sent') {
        skipped++;
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
        updated++;
      } else {
        // Create new draft
        await db.collection('partnerEmailDrafts').insertOne(emailData);
        created++;
      }
    }
    
    console.log(`Email draft generation completed: created ${created}, updated ${updated}, skipped ${skipped}`);
    return { success: true, created, updated, skipped };
    
  } catch (error) {
    console.error('Error generating email drafts:', error);
    throw error;
  }
}

function initializePartnersCronJobs(db) {
  // Run daily at 01:00 (after analytics cron at 00:01)
  cron.schedule('0 1 * * *', async () => {
    console.log('Running daily partner active days recalculation...');
    try {
      await recalculatePartnerActiveDays(db);
    } catch (error) {
      console.error('Error in daily partner active days recalculation:', error);
    }
  });
  
  // Run on the 25th of each month at 09:00 to generate email drafts for the previous period
  cron.schedule('0 9 25 * *', async () => {
    console.log('Running monthly email draft generation (25th of month)...');
    try {
      await generateEmailDrafts(db, 'previous');
    } catch (error) {
      console.error('Error in monthly email draft generation:', error);
    }
  });
  
  console.log('Partners cron jobs initialized');
  console.log('- Daily partner active days recalculation: 01:00');
  console.log('- Monthly email draft generation: 25th at 09:00');
}

async function runRecalculateNow(db) {
  try {
    return await recalculatePartnerActiveDays(db);
  } catch (error) {
    console.error('Error in manual partner active days recalculation:', error);
    throw error;
  }
}

async function runGenerateEmailDraftsNow(db, period = 'previous') {
  try {
    return await generateEmailDrafts(db, period);
  } catch (error) {
    console.error('Error in manual email draft generation:', error);
    throw error;
  }
}

module.exports = { 
  initializePartnersCronJobs, 
  runRecalculateNow,
  runGenerateEmailDraftsNow 
};
