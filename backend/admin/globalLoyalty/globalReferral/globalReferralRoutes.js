const express = require("express");
const {
  createGlobalReferral,
  getGlobalReferrals,
  updateGlobalReferral,
  deleteGlobalReferral,
  getGlobalReferralDetails,
  getUserGlobalReferrals,
  updateUserGlobalReferralStatus,
  updateUserGlobalReferral,
} = require("./globalReferralController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for GlobalReferrals
const apiRateLimiter = createRateLimiter("GlobalReferrals");
const apiRateLimiterDetails = createRateLimiter("GlobalReferrals/:id");

// Create a new GlobalReferral
router.post("/", auth,roleMiddleware(["admin"]), createGlobalReferral);

// Get all GlobalReferrals with pagination
router.get("/", roleMiddleware(["admin"]),apiRateLimiter, getGlobalReferrals);
// Get all GlobalReferrals with pagination
router.get("/user", roleMiddleware(["admin"]),apiRateLimiter, getUserGlobalReferrals);

// // Get all Users GlobalReferrals with pagination
// router.get("/users",roleMiddleware(["admin"]), apiRateLimiter, getUserGlobalReferrals);


// // //get GlobalReferral details
// // router.get("/:id", apiRateLimiterDetails, getGlobalReferralDetails);

// Update an existing GlobalReferral
router.put("/:id/:creater", roleMiddleware(["admin"]), updateGlobalReferral);
// // cancel user GlobalReferral
// router.put("/updateStatus/:id/:value", roleMiddleware(["admin"]), updateUserGlobalReferralStatus);

// // update user GlobalReferral
// router.put("/:userId/:id", roleMiddleware(["admin"]), updateUserGlobalReferral);


// Delete a GlobalReferral
router.delete("/:id", roleMiddleware(["admin"]), deleteGlobalReferral);

module.exports = router;
