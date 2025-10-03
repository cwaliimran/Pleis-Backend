// loyaltyRoutes.js
const express = require("express");
const router = express.Router();

// Import individual route modules
router.use("/challenges", require("../commonModules/loyalty/challenges/challengesRoutes"));
router.use("/promotions", require("../commonModules/loyalty/promotions/promotionsRoutes"));
router.use("/rewards", require("../commonModules/loyalty/rewards/rewardsRoutes"));
router.use("/club-collaborations", require("../commonModules/loyalty/clubCollaborations/clubCollaborationsRoutes"));
// router.use("/", require("../commonModules/loyalty/"));  // default route

module.exports = router;
