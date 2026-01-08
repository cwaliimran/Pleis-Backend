const crypto = require("crypto");

function buildAuthorizationHeader({ body, fullpath }) {
  const merchantKey = process.env.MONRI_KEY;
  const authToken = process.env.MONRI_AUTH_TOKEN;
  const timestamp = Date.now().toString(); // milliseconds

  const digest = crypto
    .createHash("sha512")
    .update(
      merchantKey +
        timestamp +
        authToken +
        fullpath +
        body
    )
    .digest("hex");

  // 🔴 merchantKey MUST be here — NOT authenticity token
  return `WP3-v2.1 ${merchantKey}:${timestamp}:${digest}`;
}

module.exports = { buildAuthorizationHeader };
