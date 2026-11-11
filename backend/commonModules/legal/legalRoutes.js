const express = require("express");
const auth = require("../../middlewares/authMiddleware");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const ctrl = require("./legalController");

const router = express.Router();
const limiter = createRateLimiter("Legal");

// Public: full text of the current version (registration screens, Settings → Legal)
router.get("/documents", limiter, ctrl.getDocuments);
router.get("/documents/:type", limiter, ctrl.getDocument);

// Signed-in: re-acceptance prompt on login + accepting it
router.get("/status", auth, ctrl.getStatus);
router.post("/accept", limiter, auth, ctrl.accept);

module.exports = router;
