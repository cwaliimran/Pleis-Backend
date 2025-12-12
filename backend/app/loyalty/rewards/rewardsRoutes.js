const express = require("express");
const {
  getRewards,
  getRewardDetails,
} = require("./rewardsController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");

const router = express.Router();

router.use(auth);

const apiRateLimiter = createRateLimiter("Rewards");
const apiRateLimiterDetails = createRateLimiter("Rewards/:id");

router.get("/by-company/:companyOrganizer", apiRateLimiter, getRewards);
router.get("/:id", apiRateLimiterDetails, getRewardDetails);

module.exports = router;
