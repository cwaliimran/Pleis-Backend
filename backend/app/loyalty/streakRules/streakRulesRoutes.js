const express = require("express");
const {
  getStreakRules,

} = require("./streakRulesController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");

const router = express.Router();

router.use(auth);

const apiRateLimiter = createRateLimiter("StreakRules");

router.get("/", apiRateLimiter, getStreakRules);

module.exports = router;
