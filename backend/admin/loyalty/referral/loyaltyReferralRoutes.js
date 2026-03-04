const express = require("express");

const {
  createLoyaltyReferral,
  getLoyaltyReferrals,
  updateLoyaltyReferral,
  deleteLoyaltyReferral,
  getUserLoyaltyReferrals,
  resetUserReferralLimits,
} = require("./loyaltyReferralController");

const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Rate limiters
const apiRateLimiter = createRateLimiter("LoyaltyReferrals");

/* =========================================================
   SETTINGS (Singleton Per Company)
========================================================= */

// Create OR Update (Upsert)
router.post(
  "/",
  roleMiddleware(["admin", "organizer"]),
  createLoyaltyReferral
);

// Get Settings (Single Object)
router.get(
  "/",
  roleMiddleware(["admin", "organizer"]),
  getLoyaltyReferrals
);

// Update Settings
router.put(
  "/:id",
  roleMiddleware(["admin", "organizer"]),
  updateLoyaltyReferral
);

// Soft Delete
router.delete(
  "/:id",
  roleMiddleware(["admin", "organizer"]),
  deleteLoyaltyReferral
);

// Reset User Referral Limits
router.get(
  "/reset",
  roleMiddleware(["admin", "organizer"]),
  resetUserReferralLimits
);


/* =========================================================
   USER REFERRAL RECORDS (Pagination Preserved)
========================================================= */

router.get(
  "/user",
  roleMiddleware(["admin", "organizer"]),
  apiRateLimiter,
  getUserLoyaltyReferrals
);

module.exports = router;