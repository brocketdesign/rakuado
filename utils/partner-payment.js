/**
 * Partner Payment Utilities
 * Shared utilities for calculating partner payments and active days
 */

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
  
  // Calculate total days in period (normalize to midnight to avoid time component issues)
  const startMidnight = new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate());
  const endMidnight = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), periodEnd.getDate());
  const totalDays = Math.round((endMidnight - startMidnight) / (1000 * 60 * 60 * 24)) + 1;
  
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

module.exports = {
  getCustomMonthPeriod,
  countActiveDaysFromAnalytics,
  calculatePartnerPayment
};
