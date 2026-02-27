const Email = require('email-templates');
const { MailtrapClient } = require('mailtrap');
const { Resend } = require('resend');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// Resend configuration (Primary)
let resendApiKey = process.env.RESEND_API_KEY;
let resendClient = null;
if (resendApiKey) {
  resendClient = new Resend(resendApiKey);
}

// Mailtrap configuration (Fallback)
let mailtrapApiKey = process.env.MAILTRAP_API_KEY;
let mailtrapUseSandbox = process.env.MAILTRAP_USE_SANDBOX === 'true';
let mailtrapInboxId = process.env.MAILTRAP_INBOX_ID ? parseInt(process.env.MAILTRAP_INBOX_ID) : undefined;

// Initialize Mailtrap client
let mailtrapClient = null;
if (mailtrapApiKey) {
  mailtrapClient = new MailtrapClient({
    token: mailtrapApiKey,
    sandbox: mailtrapUseSandbox,
    testInboxId: mailtrapInboxId,
  });
}

// Legacy SMTP settings (for user mail settings)
let host = process.env.MAIL_TRAP_SMTP;
let port = process.env.MAIL_TRAP_PORT;
let user = process.env.MAIL_TRAP_USERNAME;
let pass = process.env.MAIL_TRAP_PASSWORD;

let product_name = process.env.PRODUCT_NAME;
let product_url = process.env.PRODUCT_URL;
let company_name = process.env.COMPANY_NAME;
let company_address = process.env.COMPANY_ADDRESS;

// Rate limiting configuration
// Resend rate limit: 2 requests per second
const RATE_LIMIT_REQUESTS = 2;
const RATE_LIMIT_WINDOW_MS = 1000; // 1 second
const DELAY_BETWEEN_EMAILS_MS = 600; // 600ms = ~1.6 emails per second (safe buffer)

// Email queue for batch sending
let emailQueue = [];
let isProcessingQueue = false;

// Helper function to delay execution
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Create a NOOP transport that doesn't actually send emails (for rendering only)
const noopTransport = {
  sendMail: function(mailData, callback) {
    // Do nothing - this is just for rendering templates
    if (callback) {
      callback(null, { messageId: 'noop' });
    }
    return Promise.resolve({ messageId: 'noop' });
  },
  verify: function(callback) {
    if (callback) {
      callback(null, true);
    }
    return Promise.resolve(true);
  },
  close: function() {
    return Promise.resolve();
  }
};

// Create email templates instance for rendering (without sending)
const emailTemplates = new Email({
  message: {
    from: process.env.RESEND_FROM_EMAIL || process.env.MAILTRAP_FROM_EMAIL || user || 'noreply@rakuado.com'
  },
  send: false, // Don't send, just render
  transport: noopTransport, // NOOP transport to prevent null errors
  preview: false,
  views: {
    options: {
      extension: 'hbs'
    }
  }
});

// Helper function to render email template
async function renderEmailTemplate(template, locals) {
  const mergedLocals = { ...locals, product_name, product_url, company_address, company_name };
  
  try {
    // Render HTML and subject separately since renderAll might not work as expected
    const html = await emailTemplates.render(`${template}/html`, mergedLocals);
    let subject = '';
    try {
      subject = await emailTemplates.render(`${template}/subject`, mergedLocals);
    } catch (subjectError) {
      // Subject file might not exist, use template name as fallback
      console.warn(`Subject template not found for ${template}, using template name`);
      subject = template;
    }
    
    let text = '';
    try {
      text = await emailTemplates.render(`${template}/text`, mergedLocals);
    } catch (textError) {
      // Text version is optional
      text = '';
    }
    
    return {
      html: html || '',
      subject: subject || template || '',
      text: text || ''
    };
  } catch (error) {
    console.error('Error rendering email template:', error);
    throw error;
  }
}

// Send email using Resend (Primary)
async function sendEmailViaResend(toEmail, template, locals) {
  if (!resendClient) {
    throw new Error('Resend API key is not configured. Please set RESEND_API_KEY in environment variables.');
  }

  // Render the email template
  const rendered = await renderEmailTemplate(template, locals);
  
  // Get from email - prefer from locals, then env, then default
  const fromEmail = locals.from || process.env.RESEND_FROM_EMAIL || 'no-reply@rakuado.net';
  const fromName = locals.fromName || process.env.RESEND_FROM_NAME || company_name || 'Rakuado';
  const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

  // Send via Resend API
  const result = await resendClient.emails.send({
    from: from,
    to: [toEmail],
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text || '',
    tags: locals.tags || [{ name: 'category', value: locals.category || 'Transactional' }]
  });

  if (result.error) {
    throw new Error(`Resend API error: ${result.error.message}`);
  }

  return result;
}

// Send email using Mailtrap API (Fallback)
async function sendEmailViaMailtrap(toEmail, template, locals) {
  if (!mailtrapClient) {
    throw new Error('Mailtrap API key is not configured. Please set MAILTRAP_API_KEY in environment variables.');
  }

  // Render the email template
  const rendered = await renderEmailTemplate(template, locals);
  
  // Get from email - prefer from locals, then env, then default
  const fromEmail = locals.from || process.env.MAILTRAP_FROM_EMAIL || user || 'noreply@rakuado.com';
  const fromName = locals.fromName || process.env.MAILTRAP_FROM_NAME || company_name || 'Rakuado';

  // Send via Mailtrap API
  await mailtrapClient.send({
    from: {
      name: fromName,
      email: fromEmail
    },
    to: [{ email: toEmail }],
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text || '',
    category: locals.category || 'Transactional',
    custom_variables: locals.custom_variables || {}
  });
}

// Main send email function with fallback
exports.sendEmail = async (toEmail, template, locals) => {
  // Try Resend first (Primary)
  if (resendClient) {
    try {
      console.log(`Sending email via Resend to ${toEmail}...`);
      const result = await sendEmailViaResend(toEmail, template, locals);
      console.log(`Email sent successfully via Resend:`, result.data?.id);
      return result;
    } catch (resendError) {
      console.error('Resend failed, falling back to Mailtrap:', resendError.message);
      
      // Fall back to Mailtrap if Resend fails
      if (mailtrapClient) {
        console.log(`Falling back to Mailtrap for ${toEmail}...`);
        try {
          await sendEmailViaMailtrap(toEmail, template, locals);
          console.log(`Email sent successfully via Mailtrap (fallback)`);
          return { fallback: true, provider: 'mailtrap' };
        } catch (mailtrapError) {
          console.error('Mailtrap fallback also failed:', mailtrapError.message);
          throw new Error(`Both email providers failed. Resend: ${resendError.message}, Mailtrap: ${mailtrapError.message}`);
        }
      } else {
        throw new Error(`Resend failed and no Mailtrap fallback available. Error: ${resendError.message}`);
      }
    }
  }
  
  // If Resend is not configured, try Mailtrap
  if (mailtrapClient) {
    console.log(`Resend not configured, using Mailtrap for ${toEmail}...`);
    await sendEmailViaMailtrap(toEmail, template, locals);
    console.log(`Email sent successfully via Mailtrap`);
    return { provider: 'mailtrap' };
  }
  
  // Neither service is configured
  throw new Error('No email service is configured. Please set RESEND_API_KEY or MAILTRAP_API_KEY in environment variables.');
};

// Process email queue with rate limiting
async function processEmailQueue() {
  if (isProcessingQueue || emailQueue.length === 0) {
    return;
  }

  isProcessingQueue = true;
  console.log(`Processing email queue: ${emailQueue.length} emails pending...`);

  const results = {
    sent: [],
    failed: []
  };

  while (emailQueue.length > 0) {
    const emailTask = emailQueue.shift();
    
    try {
      console.log(`[Queue] Sending email to ${emailTask.toEmail}...`);
      const result = await exports.sendEmail(emailTask.toEmail, emailTask.template, emailTask.locals);
      
      results.sent.push({
        toEmail: emailTask.toEmail,
        result: result
      });
      
      if (emailTask.resolve) {
        emailTask.resolve({ success: true, result });
      }
    } catch (error) {
      console.error(`[Queue] Failed to send email to ${emailTask.toEmail}:`, error.message);
      
      results.failed.push({
        toEmail: emailTask.toEmail,
        error: error.message
      });
      
      if (emailTask.reject) {
        emailTask.reject(error);
      }
    }

    // Add delay between emails to respect rate limit (2 per second)
    // Only delay if there are more emails in the queue
    if (emailQueue.length > 0) {
      console.log(`[Queue] Waiting ${DELAY_BETWEEN_EMAILS_MS}ms before next email...`);
      await delay(DELAY_BETWEEN_EMAILS_MS);
    }
  }

  isProcessingQueue = false;
  console.log(`Email queue processed: ${results.sent.length} sent, ${results.failed.length} failed`);
  return results;
}

// Add email to queue for batch sending with rate limiting
exports.queueEmail = (toEmail, template, locals) => {
  return new Promise((resolve, reject) => {
    emailQueue.push({
      toEmail,
      template,
      locals,
      resolve,
      reject
    });
    
    console.log(`[Queue] Email added to queue for ${toEmail}. Queue size: ${emailQueue.length}`);
    
    // Start processing the queue if not already processing
    if (!isProcessingQueue) {
      processEmailQueue();
    }
  });
};

// Send multiple emails with rate limiting (for batch operations)
exports.sendEmailBatch = async (emails, onProgress = null) => {
  // emails should be an array of { toEmail, template, locals }
  const results = {
    sent: [],
    failed: [],
    total: emails.length
  };

  console.log(`Starting batch email send: ${emails.length} emails`);

  for (let i = 0; i < emails.length; i++) {
    const { toEmail, template, locals } = emails[i];
    
    try {
      console.log(`[Batch ${i + 1}/${emails.length}] Sending email to ${toEmail}...`);
      const result = await exports.sendEmail(toEmail, template, locals);
      
      results.sent.push({
        toEmail,
        result,
        index: i
      });
      
      if (onProgress) {
        onProgress({
          current: i + 1,
          total: emails.length,
          status: 'sent',
          toEmail
        });
      }
    } catch (error) {
      console.error(`[Batch ${i + 1}/${emails.length}] Failed to send to ${toEmail}:`, error.message);
      
      results.failed.push({
        toEmail,
        error: error.message,
        index: i
      });
      
      if (onProgress) {
        onProgress({
          current: i + 1,
          total: emails.length,
          status: 'failed',
          toEmail,
          error: error.message
        });
      }
    }

    // Add delay between emails to respect rate limit (2 per second)
    // Don't delay after the last email
    if (i < emails.length - 1) {
      console.log(`[Batch] Waiting ${DELAY_BETWEEN_EMAILS_MS}ms before next email...`);
      await delay(DELAY_BETWEEN_EMAILS_MS);
    }
  }

  console.log(`Batch email send complete: ${results.sent.length} sent, ${results.failed.length} failed`);
  return results;
};

// Send email using user's configured mail settings (SMTP fallback)
exports.sendEmailWithUserSettings = async (userMailSettings, toEmail, template, locals) => {
  if (!userMailSettings || !userMailSettings.email || !userMailSettings.password || !userMailSettings.host || !userMailSettings.port) {
    throw new Error('User mail settings are not properly configured');
  }

  // Render the email template
  const rendered = await renderEmailTemplate(template, locals);

  // Create nodemailer transport with user's settings
  const userTransport = nodemailer.createTransport({
    host: userMailSettings.host,
    port: parseInt(userMailSettings.port),
    secure: userMailSettings.port === 465, // true for 465, false for other ports
    auth: {
      user: userMailSettings.email,
      pass: userMailSettings.password
    }
  });

  // Send the rendered email via user's SMTP
  await userTransport.sendMail({
    from: userMailSettings.email,
    to: toEmail,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text || ''
  });
};

// Export individual providers for direct use if needed
exports.sendEmailViaResend = sendEmailViaResend;
exports.sendEmailViaMailtrap = sendEmailViaMailtrap;
