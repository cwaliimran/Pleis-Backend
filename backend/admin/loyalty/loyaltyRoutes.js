// loyaltyRoutes.js
const express = require("express");
const router = express.Router();

// Import individual route modules
// TODO enable when settings are ready
router.use("/listings", require("../loyalty/listings/listingsRoutes"));
router.use("/challenges", require("../loyalty/challenges/challengesRoutes"));
router.use("/promotions", require("../loyalty/promotions/promotionsRoutes"));
router.use("/rewards", require("../loyalty/rewards/rewardsRoutes"));
router.use("/club-collaborations", require("../loyalty/clubCollaborations/clubCollaborationsRoutes"));
router.use("/streaks", require("../loyalty/streaks/streaksRoutes"));
//users streaks
router.use("/users-streaks", require("../loyalty/usersStreaks/usersStreaksRoutes"));
// router.use("/", require("../commonModules/loyalty/"));  // default route

module.exports = router;
