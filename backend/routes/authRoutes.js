const express = require("express");

const {
  register,
  login,
  generateOtp,
  resetPassword,
  verifyOtp,
  logout,
  softDeleteAccount,
  hardDeleteAccount,
  resumeAccount,
  socialAuth,
  companyDetails,
} = require("../controllers/authController");
const createRateLimiter = require("../helperUtils/rateLimiter");
const roleMiddleware = require("../middlewares/roleMiddleware");
const auth = require("../middlewares/authMiddleware");
const { updateProfile } = require("../controllers/userController");

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

// Apply rate limiters to routes
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
router.put("/resume-account", resumeAccount);
router.post("/social-auth", socialAuth);

router.put(
  "/company-details",
  auth,
  companyDetailsRateLimiter,
  roleMiddleware(["organizer"]),
  companyDetails
);

router.put("/update-profile", auth, updateProfile);

module.exports = router;
