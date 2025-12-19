const express = require("express");
const {
  getRewards,
  getRewardDetails,
  claimReward,
} = require("./rewardsController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");

const router = express.Router();

router.use(auth);

const apiRateLimiter = createRateLimiter("Rewards");
const apiRateLimiterDetails = createRateLimiter("Rewards/:id");

router.get("/", apiRateLimiter, getRewards);
router.post("/claim", apiRateLimiterDetails, claimReward);

module.exports = router;
