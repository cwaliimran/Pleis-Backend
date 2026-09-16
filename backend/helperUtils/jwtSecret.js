const crypto = require("crypto");
const jwt = require("jsonwebtoken");

// Standalone helper to mint a JWT_SECRET + admin-creation token.
// Safe to require: side effects only run when executed directly.

function generateJWTSecret(length = 64) {
  return crypto.randomBytes(length).toString("hex");
}

function generateAdminCreationToken(secretKey, expiresIn = "1h") {
  return jwt.sign({ role: "admin-creation" }, secretKey, { expiresIn });
}

if (require.main === module) {
  const jwtSecret = generateJWTSecret(64);
  console.log("Your JWT_SECRET:", jwtSecret);
  console.log("Generated Token:", generateAdminCreationToken(jwtSecret));
}

module.exports = {
  generateJWTSecret,
  generateAdminCreationToken,
};
