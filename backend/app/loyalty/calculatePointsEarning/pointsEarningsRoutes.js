const express = require("express");
const {
  calculatePoints,
} = require("./pointsEarningsController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");

const router = express.Router();

router.use(auth);

const apiRateLimiter = createRateLimiter("PointsEarnings");

router.post("/", apiRateLimiter, calculatePoints);

module.exports = router;
