const express = require("express");
const {
  getTermsAndConditions,
  getAboutUs,
  getPrivacyPolicy,
  updateAdminSettings,
  createAdminSettings,
  getFaqs
} = require("./controllers/adminSettingsController");
const auth = require("../../middlewares/authMiddleware");
const admin = require("../../middlewares/adminMiddleware");
const createRateLimiter = require("../../helperUtils/rateLimiter");

const router = express.Router();

// Create a rate limiter for Admin Settings
const apiRateLimiter = createRateLimiter("AdminSettings");

// Route to fetch terms and conditions with rate limiting
router.get("/terms-conditions", apiRateLimiter, getTermsAndConditions);

// Route to fetch about us with rate limiting
router.get("/about-us", apiRateLimiter, getAboutUs);

// Route to fetch privacy policy with rate limiting
router.get("/privacy-policy", apiRateLimiter, getPrivacyPolicy);

// Route to fetch privacy policy with rate limiting
router.get("/faqs", apiRateLimiter, getFaqs);

// Route to create admin settings (requires auth and admin privileges)
router.post("/create", auth, admin, createAdminSettings);

// Route to update all settings at once (requires auth and admin privileges)
router.put("/update/:id", auth, admin, updateAdminSettings);

module.exports = router;
