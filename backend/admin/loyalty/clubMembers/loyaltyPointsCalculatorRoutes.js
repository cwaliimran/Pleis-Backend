const express = require("express");
const {
  calculateRewardPointsForOrganizer,
} = require("./clubMembersController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");

const router = express.Router();

router.use(auth);

const apiRateLimiter = createRateLimiter("PointsCalculator");

router.post("/", apiRateLimiter, calculateRewardPointsForOrganizer);

module.exports = router;
