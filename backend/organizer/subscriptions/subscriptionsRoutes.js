const express = require("express");
const {

  getSubscriptions,
  updateSubscription,
  deleteSubscription,
  getUserSubscriptions

} = require("./subscriptionsController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Subscriptions
const apiRateLimiter = createRateLimiter("Subscriptions");
const apiRateLimiterDetails = createRateLimiter("Subscriptions/:id");



// Get all Subscriptions with pagination
router.get("/", roleMiddleware(["organizer"]),apiRateLimiter, getSubscriptions);
router.get("/user", roleMiddleware(["organizer"]),apiRateLimiter, getUserSubscriptions);

router.put("/", roleMiddleware(["organizer"]),   updateSubscription,
)
router.delete("/:id", roleMiddleware(["organizer"]), deleteSubscription);

module.exports = router;
