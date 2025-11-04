const express = require("express");
const {
  get,
  getDetails,
} = require("./promotionsController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");

const router = express.Router();

router.use(auth);

const apiRateLimiter = createRateLimiter("Promotions");
const apiRateLimiterDetails = createRateLimiter("Promotions/:id");

router.get("/", apiRateLimiter, get);
router.get("/:id", apiRateLimiterDetails, getDetails);

module.exports = router;
