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


router.post("/", auth,roleMiddleware(["admin"]), createLoyaltyReferral);
router.get("/reset", roleMiddleware(["admin"]), resetUserReferralLimits);
router.get("/user", roleMiddleware(["admin"]),apiRateLimiter, getUserLoyaltyReferrals);
router.get("/", roleMiddleware(["admin"]),apiRateLimiter, getLoyaltyReferrals);
router.put("/:id", roleMiddleware(["admin"]), updateLoyaltyReferral);
router.delete("/:id", roleMiddleware(["admin"]), deleteLoyaltyReferral);

module.exports = router;
