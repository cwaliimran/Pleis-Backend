const express = require("express");

const {
  register,
  login,
  loginTest,
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
const signupRateLimiter = createRateLimiter("register", 15, 10);
const loginRateLimiter = createRateLimiter("login", 15, 20);
const loginRateLimiterTest = createRateLimiter("loginTest", 15, 10);
const generateOtpRateLimiter = createRateLimiter("forgotPassword", 15, 5);
const resendOtpRateLimiter = createRateLimiter("resendOtp", 15, 5);
const verifyOtpRateLimiter = createRateLimiter("verifyOtp", 15, 10);
const socialAuthRateLimiter = createRateLimiter("socialAuth", 15, 20);
const checkEmailRateLimiter = createRateLimiter("checkEmailExists", 15, 30);
const checkUserNameRateLimiter = createRateLimiter("checkUserNameExists", 15, 30);

const resetPasswordRateLimiter = createRateLimiter("resetPassword", 15, 5);

const companyDetailsRateLimiter = createRateLimiter("companyDetails", 15, 15);

// Create a rate limiter for /links
const linkRateLimiterEmail = createRateLimiter("link/verify-email", 15, 15);
const resendEmailVerificationLinkRateLimiter = createRateLimiter("link/resend-email", 15, 5);
const sendPasswordResetLinkRateLimiter = createRateLimiter("link/send-password-reset", 15, 5);
const verifyPasswordResetLinkRateLimiter = createRateLimiter("link/reset-password/verify", 15, 15);
const resetPasswordViaLinkRateLimiter = createRateLimiter("link/reset-password", 15, 5);

const changePasswordRateLimiter = createRateLimiter("changePassword", 15, 10);

// Apply rate limiters to routes
router.post("/internal/admin/create", signupRateLimiter, createAdmin);
router.post("/check-email-exists", checkEmailRateLimiter, checkEmailExistsAndVerified);
router.post("/check-userName-exists", checkUserNameRateLimiter, checkUserNameExists);
router.post("/register", signupRateLimiter, register);
router.post("/login", loginRateLimiter, login);
// Never expose login-test on production
if (process.env.NODE_ENV !== "prod") {
  router.post("/login-test", loginRateLimiterTest, loginTest);
}
router.post("/forgot-password", generateOtpRateLimiter, (req, res, next) => {
  req.body.type = "email";
  req.body.purpose = "forgot_password";
  generateOtp(req, res, next);
});

router.post("/resend-otp/email", resendOtpRateLimiter, (req, res, next) => {
  req.body.type = "email";
  // purpose must come from client OR fallback safely
  req.body.purpose = req.body.purpose || "generic";
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
router.post("/social-auth", socialAuthRateLimiter, socialAuth);

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
