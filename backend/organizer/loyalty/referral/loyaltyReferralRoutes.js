const express = require("express");
const {
  createLoyaltyReferral,
  getLoyaltyReferrals,
  updateLoyaltyReferral,
  deleteLoyaltyReferral,
  getLoyaltyReferralDetails,
  getUserLoyaltyReferrals,
  updateUserLoyaltyReferralStatus,
  updateUserLoyaltyReferral,
  resetUserReferralLimits
} = require("./loyaltyReferralController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for LoyaltyReferrals
const apiRateLimiter = createRateLimiter("LoyaltyReferrals");
const apiRateLimiterDetails = createRateLimiter("LoyaltyReferrals/:id");

// Create a new LoyaltyReferral
router.post("/", auth,roleMiddleware(["organizer"]), createLoyaltyReferral);


router.get("/reset", roleMiddleware(["organizer"]), resetUserReferralLimits);


router.get("/user", roleMiddleware(["organizer"]),apiRateLimiter, getUserLoyaltyReferrals);

router.get("/", roleMiddleware(["organizer"]),apiRateLimiter, getLoyaltyReferrals);

router.put("/:id", roleMiddleware(["organizer"]), updateLoyaltyReferral);

router.delete("/:id", roleMiddleware(["organizer"]), deleteLoyaltyReferral);

module.exports = router;
