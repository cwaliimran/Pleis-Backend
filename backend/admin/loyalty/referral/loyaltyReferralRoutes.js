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


router.post("/", auth,roleMiddleware(["admin","organizer"]), createLoyaltyReferral);
router.get("/reset", roleMiddleware(["admin","organizer"]), resetUserReferralLimits);
router.get("/user", roleMiddleware(["admin","organizer"]),apiRateLimiter, getUserLoyaltyReferrals);
router.get("/", roleMiddleware(["admin","organizer"]),apiRateLimiter, getLoyaltyReferrals);
router.put("/:id", roleMiddleware(["admin","organizer"]), updateLoyaltyReferral);
router.delete("/:id", roleMiddleware(["admin","organizer"]), deleteLoyaltyReferral);

module.exports = router;
