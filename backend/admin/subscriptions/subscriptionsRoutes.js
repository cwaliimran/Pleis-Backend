const express = require("express");
const {
  createSubscription,
  getSubscriptions,
  updateSubscription,
  deleteSubscription,
  getUserSubscriptions,
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
router.get("/users",roleMiddleware(["admin"]), apiRateLimiter, getUserSubscriptions);
// Get all Users Subscriptions with pagination
router.put("/users/:id",roleMiddleware(["admin"]), apiRateLimiter, updateUserSubscriptions);
router.put("/:id", roleMiddleware(["admin"]), updateSubscription);
router.delete("/:id", roleMiddleware(["admin"]), deleteSubscription);

module.exports = router;
