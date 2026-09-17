const express = require("express");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const {
  listThreatProfiles,
  getThreatProfile,
  listBlockedIps,
  blockIpHandler,
  unblockIpHandler,
  refreshGeo,
} = require("./ipThreatController");

const router = express.Router();
const rl = createRateLimiter("adminIpThreat", 15, 100);

router.get("/", rl, listThreatProfiles);
router.get("/blocklist", rl, listBlockedIps);
router.post("/block", rl, blockIpHandler);
router.delete("/block/:ip", rl, unblockIpHandler);
router.get("/:ip", rl, getThreatProfile);
router.post("/:ip/refresh-geo", rl, refreshGeo);

module.exports = router;
