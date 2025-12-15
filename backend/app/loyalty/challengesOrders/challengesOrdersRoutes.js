const express = require("express");
const {
  updateChallengeProgress,
  claimReward,
  getUserOrders
} = require("./challengeOrdersController");

const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");

const router = express.Router();

// Require authentication
router.use(auth);

const apiRateLimiter = createRateLimiter("ChallengeOrders");
const apiRateLimiterDetails = createRateLimiter("ChallengeOrders/:id");

/* -------------------------------------------------------
   Challenge Orders API
-------------------------------------------------------- */

// Start/ Increment user progress
router.post("/", apiRateLimiter, updateChallengeProgress);

// Claim reward after completing challenge
router.post("/reward/claim", apiRateLimiterDetails, claimReward);

// Get all challenge orders for logged-in user
router.get("/", apiRateLimiter, getUserOrders);

module.exports = router;
