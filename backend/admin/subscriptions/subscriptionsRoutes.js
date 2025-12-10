const express = require("express");
const {
  createSubscription,
  getSubscriptions,
  updateSubscription,
  deleteSubscription,
  getSubscriptionDetails,
  getUserSubscriptions,
  updateUserSubscriptionStatus,
  updateUserSubscription,
  getavailableSubscriptions,
  updateUserSubscriptions
} = require("./subscriptionsController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Subscriptions
const apiRateLimiter = createRateLimiter("Subscriptions");
const apiRateLimiterDetails = createRateLimiter("Subscriptions/:id");

// Create a new Subscription
router.post("/", auth,roleMiddleware(["admin"]), createSubscription);

// Get all Subscriptions with pagination
router.get("/", roleMiddleware(["admin"]),apiRateLimiter, getSubscriptions);

// // Get all Subscriptions with pagination
// router.get("/available", roleMiddleware(["admin"]),apiRateLimiter, getavailableSubscriptions);

// Get all Users Subscriptions with pagination
router.get("/users",roleMiddleware(["admin"]), apiRateLimiter, getUserSubscriptions);
// Get all Users Subscriptions with pagination
router.put("/users/:id",roleMiddleware(["admin"]), apiRateLimiter, updateUserSubscriptions);


// //get Subscription details
// router.get("/:id", apiRateLimiterDetails, getSubscriptionDetails);

// Update an existing Subscription
router.put("/:id", roleMiddleware(["admin"]), updateSubscription);
// // cancel user Subscription
// router.put("/updateStatus/:id/:value", roleMiddleware(["admin"]), updateUserSubscriptionStatus);

// // update user Subscription
// router.put("/:userId/:id", roleMiddleware(["admin"]), updateUserSubscription);


// Delete a Subscription
router.delete("/:id", roleMiddleware(["admin"]), deleteSubscription);

module.exports = router;
