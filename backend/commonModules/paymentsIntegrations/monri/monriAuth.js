const crypto = require("crypto");
const { getMonriKey, getMonriAuthToken } = require("./monriEnv");

function buildAuthorizationHeader({ body }) {
  const merchantKey = getMonriKey();
  const authToken = getMonriAuthToken();

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

  
  return authorization;
}

module.exports = { buildAuthorizationHeader };
