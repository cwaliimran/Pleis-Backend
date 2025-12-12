const express = require("express");

const {
  register,
  login,
  generateOtp,
  resetPassword,
  verifyOtp,
  logout,
  hardDeleteAccount,
  socialAuth,
  companyDetails,
  verifyEmailViaLink,
  resendEmailVerificationLink,
  sendPasswordResetLink,
  verifyPasswordResetLink,
  resetPasswordViaLink,
  checkEmailExistsAndVerified,
  changePassword,
  createAdmin,
  checkUserNameExists
} = require("../controllers/authController");
const createRateLimiter = require("../helperUtils/rateLimiter");
const roleMiddleware = require("../middlewares/roleMiddleware");
const auth = require("../middlewares/authMiddleware");

const router = express.Router();
// Create a rate limiter for signup routes
// Define rate limiters
const signupRateLimiter = createRateLimiter("register", 15, 15); // 15 requests per 15 minutes
const loginRateLimiter = createRateLimiter("login", 15, 15); // 15 requests per 15 minute
const generateOtpRateLimiter = createRateLimiter("forgotPassword", 15, 15); // 15 requests per 15 minutes
const resendOtpRateLimiter = createRateLimiter("resendOtp", 15, 15); // 15 requests per 15 minutes
const verifyOtpRateLimiter = createRateLimiter("verifyOtp", 15, 15); // 10 requests per 10 minutes

const resetPasswordRateLimiter = createRateLimiter("resetPassword", 15, 15); // 15 requests per 15 minutes

const companyDetailsRateLimiter = createRateLimiter("companyDetails", 15, 15); // 15 requests per 15 minutes

// Create a rate limiter for /links
const linkRateLimiterEmail = createRateLimiter("link/verify-email", 15, 15); // 15 requests per 15 minutes
const resendEmailVerificationLinkRateLimiter = createRateLimiter("link/resend-email", 15, 15); // 15 requests per 15 minutes
const sendPasswordResetLinkRateLimiter = createRateLimiter("link/send-password-reset", 15, 15); // 15 requests per 15 minutes
const verifyPasswordResetLinkRateLimiter = createRateLimiter("link/reset-password/verify", 15, 15); // 15 requests per 15 minutes
const resetPasswordViaLinkRateLimiter = createRateLimiter("link/reset-password", 15, 15); // 15 requests per 15 minutes

const changePasswordRateLimiter = createRateLimiter("changePassword", 15, 5);

// Apply rate limiters to routes
router.post("/internal/admin/create", signupRateLimiter, createAdmin);
router.post("/check-email-exists", checkEmailExistsAndVerified);
router.post("/check-userName-exists", checkUserNameExists);
router.post("/register", signupRateLimiter, register);
router.post("/login", loginRateLimiter, login);
router.post("/forgot-password", generateOtpRateLimiter, (req, res, next) => {
  req.body.type = "email";
  generateOtp(req, res, next);
});
router.post("/resend-otp/email", resendOtpRateLimiter, (req, res, next) => {
  req.body.type = "email";
  generateOtp(req, res, next);
});
router.post("/resend-otp/phone", resendOtpRateLimiter, (req, res, next) => {
  req.body.type = "phoneNumber";
  generateOtp(req, res, next);
});
router.post("/verify-otp/email", verifyOtpRateLimiter, (req, res, next) => {
  req.body.type = "email";
  verifyOtp(req, res, next);
});
router.post("/verify-otp/phone", verifyOtpRateLimiter, (req, res, next) => {
  req.body.type = "phoneNumber";
  verifyOtp(req, res, next);
});
router.post("/reset-password", resetPasswordRateLimiter, resetPassword);

router.post("/logout", auth, logout);
router.delete("/delete-account", auth, hardDeleteAccount);
router.post("/social-auth", socialAuth);

router.get("/link/verify-email", linkRateLimiterEmail, verifyEmailViaLink);
router.post("/link/resend-email", resendEmailVerificationLinkRateLimiter, resendEmailVerificationLink);
router.post("/link/send-password-reset", sendPasswordResetLinkRateLimiter, sendPasswordResetLink);
router.get("/link/reset-password/verify", verifyPasswordResetLinkRateLimiter, verifyPasswordResetLink);
router.post("/link/reset-password", resetPasswordViaLinkRateLimiter, resetPasswordViaLink);
router.post(
  "/change-password",
  changePasswordRateLimiter,
  auth,
  changePassword
);


router.put(
  "/company-details",
  auth,
  companyDetailsRateLimiter,
  roleMiddleware(["organizer"]),
  companyDetails
);

module.exports = router;
