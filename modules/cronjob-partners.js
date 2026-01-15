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
  
  console.log('Partners cron jobs initialized');
}

async function runRecalculateNow(db) {
  try {
    return await recalculatePartnerActiveDays(db);
  } catch (error) {
    console.error('Error in manual partner active days recalculation:', error);
    throw error;
  }
}

module.exports = { initializePartnersCronJobs, runRecalculateNow };
