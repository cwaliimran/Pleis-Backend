const crypto = require("crypto");

function buildAuthorizationHeader({ body }) {
  const merchantKey = process.env.MONRI_KEY;
  const authToken = process.env.MONRI_AUTH_TOKEN;

  // unix timestamp (seconds)
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const rawForDigest =
    merchantKey +
    timestamp +
    authToken +
    body;

  const digest = crypto
    .createHash("sha512")
    .update(rawForDigest)
    .digest("hex");

  const authorization = `WP3-v2 ${authToken} ${timestamp} ${digest}`;

  // DEBUG (remove later)
  console.log("===== MONRI DOC-CORRECT AUTH =====");
  console.log("merchantKey:", merchantKey);
  console.log("authToken:", authToken);
  console.log("timestamp:", timestamp);
  console.log("body:", body);
  console.log("rawForDigest:", rawForDigest);
  console.log("digest:", digest);
  console.log("authorization:", authorization);
  console.log("=================================");

  return authorization;
}

module.exports = { buildAuthorizationHeader };
