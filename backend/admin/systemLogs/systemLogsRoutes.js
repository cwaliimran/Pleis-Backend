const express = require("express");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const { listLogFiles, getLogs } = require("./systemLogsController");

const router = express.Router();
const rl = createRateLimiter("adminSystemLogs", 15, 120);

// Auth + admin role applied in backend/admin/routes/index.js
router.get("/files", rl, listLogFiles);
router.get("/", rl, getLogs);

module.exports = router;
