const speakeasy = require("speakeasy");
const QRCode = require("qrcode");

/**
 * Generate 2FA secret and QR code for Google Authenticator
 * @param {string} appName - Name of your application
 * @param {string} userIdentifier - User identifier (email or username)
 * @returns {Promise<{ secret: string, qrCodeDataURL: string }>}
 */
const generate2FASecret = async (userIdentifier) => {
  const secret = speakeasy.generateSecret({
    name: `Pleis App (${userIdentifier})`,
    length: 32,
  });

  // Generate QR code from otpauth URL
  const qrCodeDataURL = await QRCode.toDataURL(secret.otpauth_url);

  return {
    secret: secret.base32, // Store securely in DB
    qrCodeDataURL,         // Send to frontend for scanning
  };
};

/**
 * Verify 2FA token provided by user
 * @param {string} token - 6-digit code from Google Authenticator
 * @param {string} userSecret - Base32 secret stored in DB
 * @returns {boolean} - true if valid, false otherwise
 */
const verify2FAToken = (token, userSecret) => {
  return speakeasy.totp.verify({
    secret: userSecret,
    encoding: "base32",
    token,
    window: 1, // Allow 30s before/after to handle time drift
  });
};

module.exports = {
  generate2FASecret,
  verify2FAToken,
};
