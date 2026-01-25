# Partner Email Management System

## Overview
This system automates the generation and sending of monthly payment notification emails to partners. It allows you to manage email drafts, edit payment details, and track the status of sent emails.

## Features

### 1. Automatic Email Draft Generation
- **Schedule**: Automatically generates email drafts on the 25th of each month at 09:00
- **Period**: Generates drafts for the previous period (21st to 20th)
- **Content**: Includes payment amount, active days, and bank information

### 2. Dashboard Features
- **Email List**: View all email drafts with their status
- **Status Filtering**: Filter by draft, sent, no_data, or error status
- **Batch Operations**: Select and send multiple emails at once
- **Email Preview**: Preview email content before sending
- **Edit Drafts**: Manually adjust inactive days to recalculate payments

### 3. Email Status Types
- **draft**: Email is ready to be sent
- **sent**: Email has been successfully sent
- **no_data**: No analytics data available for the period
- **error**: Email sending failed (with error message)

## Usage

### Accessing the Dashboard
1. Navigate to the dashboard: `/dashboard/app/partner-emails`
2. Or click on "パートナーメール管理" from the main dashboard

### Generating Email Drafts
1. Select the period (Current or Previous)
2. Click "ドラフト生成 / Generate Drafts"
3. The system will create drafts for all partners

### Editing a Draft
1. Click the "編集 / Edit" button for a partner
2. Update the inactive days if needed
3. The payment amount will automatically recalculate
4. Click "保存 / Save" to update the draft

### Sending Emails

#### Single Email
1. Click "プレビュー / Preview" to review the email
2. Click "送信 / Send" to send the email

#### Batch Sending
1. Check the boxes next to the emails you want to send
2. Click "一括送信 / Send All"
3. Confirm the action

## API Endpoints

### GET `/api/partners/emails/drafts`
Get all email drafts for a period.

**Query Parameters:**
- `period`: `current` or `previous` (default: `current`)

**Response:**
```json
{
  "success": true,
  "period": {
    "name": "current",
    "startDate": "2024-01-21",
    "endDate": "2024-02-20"
  },
  "drafts": [...]
}
```

### POST `/api/partners/emails/generate`
Generate email drafts for all partners.

**Body:**
```json
{
  "period": "current"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Email drafts generated successfully",
  "summary": {
    "created": 5,
    "updated": 3,
    "skipped": 2
  }
}
```

### GET `/api/partners/emails/draft/:draftId`
Get a specific email draft.

**Response:**
```json
{
  "success": true,
  "draft": {...}
}
```

### PUT `/api/partners/emails/draft/:draftId`
Update an email draft.

**Body:**
```json
{
  "inactiveDays": 5,
  "notes": "Updated notes"
}
```

### POST `/api/partners/emails/send/:draftId`
Send a specific email.

**Response:**
```json
{
  "success": true,
  "message": "Email sent successfully",
  "draft": {...}
}
```

### POST `/api/partners/emails/send-batch`
Send multiple emails in batch.

**Body:**
```json
{
  "draftIds": ["id1", "id2", "id3"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Batch email sending completed",
  "results": {
    "sent": [...],
    "failed": [...],
    "skipped": [...]
  }
}
```

### DELETE `/api/partners/emails/draft/:draftId`
Delete an email draft.

## Email Template

The email template is located at `emails/partner payment notification/`.

### Template Variables:
- `partnerName`: Partner's name
- `domain`: Partner's domain
- `periodStart`: Period start date
- `periodEnd`: Period end date
- `periodMonth`: Period month in Japanese format
- `paymentCycle`: Payment cycle (当月 or 翌月)
- `monthlyAmount`: Monthly amount in yen
- `totalDays`: Total days in period
- `activeDays`: Active days in period
- `inactiveDays`: Inactive days in period
- `paymentAmount`: Calculated payment amount
- `bankInfo`: Bank account information
- `notes`: Additional notes

## Cron Jobs

### Daily Recalculation (01:00)
Recalculates active days for all partners based on analytics data.

### Monthly Draft Generation (25th at 09:00)
Automatically generates email drafts for the previous period on the 25th of each month.

## Database Collection

### `partnerEmailDrafts`
```javascript
{
  _id: ObjectId,
  partnerId: String,
  partnerName: String,
  partnerEmail: String,
  domain: String,
  periodStart: String, // ISO date format
  periodEnd: String, // ISO date format
  periodMonth: String, // Japanese format
  paymentCycle: String,
  monthlyAmount: Number,
  totalDays: Number,
  activeDays: Number,
  inactiveDays: Number,
  paymentAmount: Number,
  bankInfo: Object,
  notes: String,
  status: String, // draft, sent, no_data, error
  hasData: Boolean,
  errorMessage: String,
  createdAt: Date,
  updatedAt: Date,
  sentAt: Date
}
```

## Workflow

1. **On the 25th**: System automatically generates email drafts for the previous period
2. **Admin Review**: Admin logs into the dashboard and reviews the drafts
3. **Manual Adjustments**: If needed, admin can edit inactive days for any partner
4. **Preview**: Admin can preview email content before sending
5. **Send**: Admin sends emails individually or in batch
6. **Status Tracking**: System tracks which emails were sent, which failed, and which need attention

## Error Handling

- If a partner has no email configured, the draft status will be set to `error`
- If analytics data is unavailable, the draft status will be set to `no_data`
- If email sending fails, the draft status will be set to `error` with an error message
- Already sent emails cannot be modified or resent

## Best Practices

1. **Review Before Sending**: Always preview emails before sending
2. **Check Data Availability**: Ensure drafts marked as `no_data` have inactive days manually entered
3. **Batch Sending**: Use batch sending for efficiency, but review the list first
4. **Regular Monitoring**: Check the dashboard regularly to ensure all emails are sent
5. **Error Resolution**: Address any errors promptly by checking partner email configuration

## Security Considerations

- Email sending requires authentication
- Dashboard is protected by `ensureAuthenticated` and `ensureMembership` middleware
- Email content is sanitized before rendering (HTML escaping implemented)
- Sensitive bank information is only visible to authenticated users
- **Note**: For production deployment, add rate limiting to API endpoints to prevent abuse

### Recommended Rate Limiting Configuration
```javascript
const rateLimit = require('express-rate-limit');

const emailApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

// Apply to email API routes
app.use('/api/partners/emails', emailApiLimiter);
```

## Troubleshooting

### Drafts Not Generated
- Check cron job is running
- Verify analytics data is available for the period
- Check server logs for errors

### Email Not Sending
- Verify partner email is configured
- Check email service configuration (Mailtrap/SMTP)
- Review error message in draft status

### Payment Calculation Issues
- Verify analytics data is being collected
- Check partner start/stop dates
- Manually adjust inactive days if needed

## Future Enhancements

- Email scheduling (schedule send for later)
- Email templates customization
- Email preview in different languages
- Attachment support (PDF invoices)
- Email open/click tracking
- Automated retry for failed emails
