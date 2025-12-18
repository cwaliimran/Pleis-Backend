const express = require("express");
const auth = require("../../../middlewares/authMiddleware");
const {
  getGlobalChallenges
} = require("./challengesController");

const router = express.Router();

router.use(auth);

/**
 * GET /global-loyalty/challenges
 */
router.get("/", getGlobalChallenges);

module.exports = router;
