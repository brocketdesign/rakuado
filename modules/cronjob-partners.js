const cron = require('node-cron');

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
async function countActiveDaysFromAnalytics(db, domain, periodStart, periodEnd) {
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

// Helper function to calculate partner payment
async function calculatePartnerPayment(db, partner, periodStart, periodEnd, customInactiveDays = null) {
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
  const daysActiveFromAnalytics = await countActiveDaysFromAnalytics(db, partner.domain, effectiveStart, effectiveEnd);
  
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
