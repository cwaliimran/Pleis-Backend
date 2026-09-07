const crypto = require("crypto");
const { getMonriWebhookSecret } = require("../../monri/monriEnv");

const verifyMonriSignature = (req) => {
  const signature = req.headers["x-monri-signature"];
  const payload = JSON.stringify(req.body);

  const expected = crypto
    .createHmac("sha256", getMonriWebhookSecret())
    .update(payload)
    .digest("hex");

  if (signature !== expected) {
    throw new Error("invalid_monri_signature");
  }
};

module.exports = { verifyMonriSignature };
