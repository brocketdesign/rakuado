const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { sendEmail, sendEmailWithUserSettings } = require('../../services/email');
const ensureAuthenticated = require('../../middleware/authMiddleware');
const ensureMembership = require('../../middleware/ensureMembership');

// Apply authentication middleware to all routes
router.use(ensureAuthenticated);
router.use(ensureMembership);

// Get all partner requests
router.get('/', async (req, res) => {
  try {
    const partnerRequestsCollection = global.db.collection('partnerRequests');
    const requests = await partnerRequestsCollection.find({}).sort({ createdAt: -1 }).toArray();
    
    res.json({
      success: true,
      requests: requests.map(r => ({
        ...r,
        _id: r._id.toString()
      }))
    });
  } catch (error) {
    console.error('Error fetching partner requests:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch partner requests'
    });
  }
});

// Get single partner request
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const partnerRequestsCollection = global.db.collection('partnerRequests');
    
    let request;
    try {
      request = await partnerRequestsCollection.findOne({ _id: new ObjectId(id) });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request ID'
      });
    }
    
    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found'
      });
    }
    
    res.json({
      success: true,
      request: {
        ...request,
        _id: request._id.toString()
      }
    });
  } catch (error) {
    console.error('Error fetching partner request:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch partner request'
    });
  }
});

// Update partner request
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      currentStep,
      status,
      googleAnalyticsUrl,
      estimatedMonthlyAmount,
      notes,
      sendPaymentProposal // Flag to send payment proposal email
    } = req.body;
    
    const partnerRequestsCollection = global.db.collection('partnerRequests');
    
    const updateData = {
      updatedAt: new Date()
    };
    
    if (currentStep !== undefined) updateData.currentStep = currentStep;
    if (status !== undefined) updateData.status = status;
    if (googleAnalyticsUrl !== undefined) {
      updateData.googleAnalyticsUrl = googleAnalyticsUrl;
      if (googleAnalyticsUrl) {
        updateData.googleAnalyticsSubmitted = true;
      }
    }
    if (estimatedMonthlyAmount !== undefined) {
      updateData.estimatedMonthlyAmount = estimatedMonthlyAmount ? parseInt(estimatedMonthlyAmount) : null;
    }
    if (notes !== undefined) updateData.notes = notes;
    
    let result;
    try {
      result = await partnerRequestsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData }
      );
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request ID'
      });
    }
    
    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Request not found'
      });
    }
    
    // If payment proposal should be sent, send email
    if (sendPaymentProposal && estimatedMonthlyAmount) {
      const partnerRequestsCollection = global.db.collection('partnerRequests');
      const updatedRequest = await partnerRequestsCollection.findOne({ _id: new ObjectId(id) });
      
      if (updatedRequest) {
        const nameFromEmail = updatedRequest.email.split('@')[0];
        const emailData = {
          email: updatedRequest.email,
          name: nameFromEmail + '様',
          blogUrl: updatedRequest.blogUrl,
          estimatedAmount: parseInt(estimatedMonthlyAmount).toLocaleString('ja-JP')
        };
        
        try {
          // Get user's mail settings
          const user = await global.db.collection('users').findOne({ _id: req.user._id });
          if (user && user.mailSettings && user.mailSettings.email && user.mailSettings.password) {
            await sendEmailWithUserSettings(user.mailSettings, updatedRequest.email, 'partner recruitment payment proposal', emailData);
          } else {
            // Fallback to system email if user settings not configured
            await sendEmail(updatedRequest.email, 'partner recruitment payment proposal', emailData);
          }
        } catch (emailError) {
          console.error('Error sending payment proposal email:', emailError);
          // Continue even if email fails
        }
      }
    }
    
    res.json({
      success: true,
      message: 'Request updated successfully'
    });
  } catch (error) {
    console.error('Error updating partner request:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update partner request'
    });
  }
});

// Request Google Analytics
router.post('/:id/request-analytics', async (req, res) => {
  try {
    const { id } = req.params;
    const partnerRequestsCollection = global.db.collection('partnerRequests');
    
    let request;
    try {
      request = await partnerRequestsCollection.findOne({ _id: new ObjectId(id) });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request ID'
      });
    }
    
    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found'
      });
    }
    
    // Update status
    await partnerRequestsCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: 'analytics_requested',
          currentStep: 'analytics_requested',
          updatedAt: new Date()
        }
      }
    );
    
    // Send email to applicant requesting analytics
    const emailData = {
      email: request.email,
      blogUrl: request.blogUrl,
      requestId: id
    };
    
    try {
      // Get user's mail settings
      const user = await global.db.collection('users').findOne({ _id: req.user._id });
      if (user && user.mailSettings && user.mailSettings.email && user.mailSettings.password) {
        await sendEmailWithUserSettings(user.mailSettings, request.email, 'partner recruitment analytics request', emailData);
      } else {
        // Fallback to system email if user settings not configured
        await sendEmail(request.email, 'partner recruitment analytics request', emailData);
      }
    } catch (emailError) {
      console.error('Error sending analytics request email:', emailError);
      // Continue even if email fails
    }
    
    res.json({
      success: true,
      message: 'Analytics request sent successfully'
    });
  } catch (error) {
    console.error('Error requesting analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to request analytics'
    });
  }
});

// Send snippet
router.post('/:id/send-snippet', async (req, res) => {
  try {
    const { id } = req.params;
    const partnerRequestsCollection = global.db.collection('partnerRequests');
    
    let request;
    try {
      request = await partnerRequestsCollection.findOne({ _id: new ObjectId(id) });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request ID'
      });
    }
    
    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found'
      });
    }
    
    // Generate snippet code
    const appDomain = process.env.PRODUCT_URL || 'https://app.rakuado.net';
    const snippetCode = `
<!-- RakuAdo Partner Ad Script -->
<script>
  (function() {
    var script = document.createElement('script');
    script.src = '${appDomain}/api/partner-ad.js?partnerId=${id}';
    script.async = true;
    document.head.appendChild(script);
  })();
</script>
<!-- End RakuAdo Partner Ad Script -->
    `.trim();
    
    // Update status
    await partnerRequestsCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          currentStep: 'snippet_sent',
          snippetSent: true,
          snippetCode: snippetCode,
          updatedAt: new Date()
        }
      }
    );
    
    // Send email with snippet
    // Extract name from email if available, or use email prefix
    const nameFromEmail = request.email.split('@')[0];
    const emailData = {
      email: request.email,
      name: nameFromEmail + '様',
      blogUrl: request.blogUrl,
      snippetCode: snippetCode,
      requestId: id
    };
    
    try {
      // Get user's mail settings
      const user = await global.db.collection('users').findOne({ _id: req.user._id });
      if (user && user.mailSettings && user.mailSettings.email && user.mailSettings.password) {
        await sendEmailWithUserSettings(user.mailSettings, request.email, 'partner recruitment snippet', emailData);
      } else {
        // Fallback to system email if user settings not configured
        await sendEmail(request.email, 'partner recruitment snippet', emailData);
      }
    } catch (emailError) {
      console.error('Error sending snippet email:', emailError);
      // Continue even if email fails
    }
    
    res.json({
      success: true,
      message: 'Snippet sent successfully',
      snippetCode: snippetCode
    });
  } catch (error) {
    console.error('Error sending snippet:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send snippet'
    });
  }
});

// Verify snippet activation
router.post('/:id/verify-snippet', async (req, res) => {
  try {
    const { id } = req.params;
    const partnerRequestsCollection = global.db.collection('partnerRequests');
    
    let request;
    try {
      request = await partnerRequestsCollection.findOne({ _id: new ObjectId(id) });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request ID'
      });
    }
    
    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found'
      });
    }
    
    // TODO: Implement actual verification logic (check if snippet is present on the blog)
    // For now, just mark as verified
    
    // Update status
    await partnerRequestsCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          currentStep: 'snippet_verified',
          snippetVerified: true,
          status: 'approved',
          updatedAt: new Date()
        }
      }
    );
    
    res.json({
      success: true,
      message: 'Snippet verified successfully'
    });
  } catch (error) {
    console.error('Error verifying snippet:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify snippet'
    });
  }
});

// Reject request
router.post('/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const partnerRequestsCollection = global.db.collection('partnerRequests');
    
    let request;
    try {
      request = await partnerRequestsCollection.findOne({ _id: new ObjectId(id) });
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request ID'
      });
    }
    
    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found'
      });
    }
    
    // Update status
    await partnerRequestsCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: 'rejected',
          currentStep: 'rejected',
          updatedAt: new Date()
        }
      }
    );
    
    // Send rejection email
    const nameFromEmail = request.email.split('@')[0];
    const emailData = {
      email: request.email,
      name: nameFromEmail + '様',
      blogUrl: request.blogUrl,
      requestId: id,
      reason: req.body.reason || '' // Optional rejection reason from request body
    };
    
    try {
      // Get user's mail settings
      const user = await global.db.collection('users').findOne({ _id: req.user._id });
      if (user && user.mailSettings && user.mailSettings.email && user.mailSettings.password) {
        await sendEmailWithUserSettings(user.mailSettings, request.email, 'partner recruitment rejected', emailData);
      } else {
        // Fallback to system email if user settings not configured
        await sendEmail(request.email, 'partner recruitment rejected', emailData);
      }
    } catch (emailError) {
      console.error('Error sending rejection email:', emailError);
      // Continue even if email fails
    }
    
    res.json({
      success: true,
      message: 'Request rejected successfully'
    });
  } catch (error) {
    console.error('Error rejecting request:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reject request'
    });
  }
});

module.exports = router;
