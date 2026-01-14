const Mailgun = require('mailgun.js');

const mailgun = new Mailgun(FormData);
const mg = mailgun.client({
  username: "api",
  key: process.env.MAILGUN_API_KEY, // Use Mailgun API key
  url: process.env.MAILGUN_BASE_URL || "https://api.mailgun.net" // Optional for EU domains
});

const sendEmailViaMailgun = async (emails, subject, body, config = {}) => {
  try {
    const {
      fromEmail = "Pleis <noreply@pleis.ai>",
      attachments = [],
      isHtml = true,
    } = config;
    


    const data = await mg.messages.create(process.env.MAILGUN_DOMAIN, {
      from: fromEmail,
      to: emails, // Array of email strings
      subject: subject,
      ...(isHtml ? { html: body } : { text: body })
    });
    return data;
  } catch (error) {
    console.error("Error sending email via Mailgun:", error);
    throw error;
  }
};

module.exports = { sendEmailViaMailgun };
