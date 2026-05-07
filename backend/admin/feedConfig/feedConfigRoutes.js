const express = require("express");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");
const {
  getFeedConfig,
  updateFeedConfig,
} = require("./feedConfigController");

const router = express.Router();
const apiRateLimiter = createRateLimiter("FeedConfig");

router.use(auth);

router.get("/quick-action", apiRateLimiter, getFeedConfig);
router.patch("/quick-action", roleMiddleware(["admin"]), updateFeedConfig);

module.exports = router;