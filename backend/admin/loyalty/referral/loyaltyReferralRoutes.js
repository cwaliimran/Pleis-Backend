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
router.post("/", auth,roleMiddleware(["admin"]), createLoyaltyReferral);

// Delete a LoyaltyReferral
router.get("/reset", roleMiddleware(["admin"]), resetUserReferralLimits);

// Get all LoyaltyReferrals with pagination
router.get("/user", roleMiddleware(["admin"]),apiRateLimiter, getUserLoyaltyReferrals);

// Get all LoyaltyReferrals with pagination
router.get("/", roleMiddleware(["admin"]),apiRateLimiter, getLoyaltyReferrals);


// // Get all Users LoyaltyReferrals with pagination
// router.get("/users",roleMiddleware(["admin"]), apiRateLimiter, getUserLoyaltyReferrals);


// // //get LoyaltyReferral details
// // router.get("/:id", apiRateLimiterDetails, getLoyaltyReferralDetails);

// Update an existing LoyaltyReferral
router.put("/:id", roleMiddleware(["admin"]), updateLoyaltyReferral);
// // cancel user LoyaltyReferral
// router.put("/updateStatus/:id/:value", roleMiddleware(["admin"]), updateUserLoyaltyReferralStatus);

// // update user LoyaltyReferral
// router.put("/:userId/:id", roleMiddleware(["admin"]), updateUserLoyaltyReferral);


// Delete a LoyaltyReferral
router.delete("/:id", roleMiddleware(["admin"]), deleteLoyaltyReferral);

module.exports = router;
