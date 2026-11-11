const express = require("express");
const ctrl = require("./legalController");

// Mounted under /admin (already auth + admin-only).
const router = express.Router();
router.get("/", ctrl.adminGetDocuments);
router.get("/consent-logs", ctrl.adminGetConsentLogs);
router.get("/:type/history", ctrl.adminGetHistory);
router.post("/", ctrl.adminPublish);

module.exports = router;
