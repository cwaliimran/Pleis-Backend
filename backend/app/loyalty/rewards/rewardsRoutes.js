const express = require("express");
const {
  getRewards,
  getRewardDetails,
  claimReward,
  getJoinedClubsRewards
} = require("./rewardsController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");

const router = express.Router();

router.use(auth);

const apiRateLimiter = createRateLimiter("Rewards");
const apiRateLimiterDetails = createRateLimiter("Rewards/:id");

router.get("/by-company/:companyOrganizer", apiRateLimiter, getRewards);
router.get("/joined-clubs", apiRateLimiter, getJoinedClubsRewards);
// router.get("/:id", apiRateLimiterDetails, getRewardDetails);
router.post("/claim", apiRateLimiterDetails, claimReward);

module.exports = router;
