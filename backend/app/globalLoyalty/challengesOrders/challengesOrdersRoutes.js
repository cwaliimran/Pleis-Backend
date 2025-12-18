const express = require("express");
const auth = require("../../../middlewares/authMiddleware");
const {
  resolveGlobalChallenge
} = require("./challengesOrdersController");

const router = express.Router();

router.use(auth);

/**
 * POST /global-loyalty/challenges-orders/resolve
 */
router.post("/resolve", resolveGlobalChallenge);

module.exports = router;
