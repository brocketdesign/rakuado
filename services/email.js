const Email = require('email-templates');
const nodemailer = require('nodemailer');

let host=process.env.MAIL_TRAP_SMTP;
let port=process.env.MAIL_TRAP_PORT;
let user=process.env.MAIL_TRAP_USERNAME;
let pass=process.env.MAIL_TRAP_PASSWORD;

let product_name = process.env.PRODUCT_NAME;
let product_url = process.env.PRODUCT_URL;
let company_name = process.env.COMPANY_NAME;
let company_address = process.env.COMPANY_ADDRESS;

let transport = nodemailer.createTransport({
  host,
  //host: 'localhost', //will cause error but show email preview
  port,
  auth: {
    user,
    pass
  }
});

const email = new Email({
  message: {
    from: user
  },
  send: true,
  transport,
  preview: false,
  views: {
    options: {
      extension: 'hbs'
    }
  }
});


exports.sendEmail = async (toEmail, template, locals) => {
  await email.send({
    template,
    message: {
      to: toEmail
    },
    locals: { ...locals, product_name, product_url, company_address, company_name }
  });
};
