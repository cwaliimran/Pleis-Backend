const express = require("express");
const {
  getFriends,
  createFriendRequest,
  getFriendRequests,
} = require("./friendRequestController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Promo Codes
const promoCodeRateLimiter = createRateLimiter("PromoCodes");

// Routes for Promo Code Management
// use  Promo Code
router.get("/", getFriends);
router.post("/add-friend", createFriendRequest);
router.get("/get-friend-requests", getFriendRequests);


module.exports = router;
