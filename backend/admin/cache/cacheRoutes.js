const express = require("express");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const { flushCaches } = require("./cacheController");

const router = express.Router();
const apiRateLimiter = createRateLimiter("AdminCache");

// Parent /admin router already applies auth + admin role.
router.delete("/", apiRateLimiter, flushCaches);
router.post("/flush", apiRateLimiter, flushCaches);

module.exports = router;
