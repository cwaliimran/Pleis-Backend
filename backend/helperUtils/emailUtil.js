const Mailgun = require('mailgun.js');
const {
  resolveMailFrom,
  resolveMailgunApiBase,
} = require("../config/CONSTANTS");

const mailgun = new Mailgun(FormData);
const mg = mailgun.client({
  username: "api",
  key: process.env.MAILGUN_API_KEY, // Use Mailgun API key
  url: resolveMailgunApiBase(),
});

const sendEmailViaMailgun = async (emails, subject, body, config = {}) => {
  try {
    const {
      fromEmail = resolveMailFrom(),
      attachments = [],
      inline = [],
      isHtml = true,
      replyTo,
      variables = null,
    } = config;

    const payload = {
      from: fromEmail,
      to: emails,
      subject,
      ...(isHtml ? { html: body } : { text: body }),
    };

    if (replyTo) payload["h:Reply-To"] = replyTo;
    if (variables && typeof variables === "object") {
      for (const [key, value] of Object.entries(variables)) {
        if (value == null) continue;
        payload[`v:${key}`] = String(value);
      }
    }
    if (attachments.length) {
      payload.attachment = attachments.map((file) => ({
        filename: file.filename,
        data: file.data,
        contentType: file.contentType || "application/octet-stream",
      }));
    }
    if (inline.length) {
      payload.inline = inline.map((file) => ({
        filename: file.filename,
        data: file.data,
        contentType: file.contentType || "application/octet-stream",
      }));
    }

    const data = await mg.messages.create(process.env.MAILGUN_DOMAIN, payload);

    return { success: true, data };

  } catch (error) {
    console.error("Mailgun error:", error.message);
    // ❗ DO NOT THROW
    return { success: false, error };
  }
};

module.exports = { sendEmailViaMailgun };
