// loyaltyRoutes.js
const express = require("express");
const router = express.Router();

// Import individual route modules
// TODO enable when settings are ready
router.use("/dashboard", require("../loyalty/dashboard/dashboardsRoutes"));
router.use("/listings", require("../loyalty/listings/listingsRoutes"));
router.use("/challenges", require("../loyalty/challenges/challengesRoutes"));
router.use("/promotions", require("../loyalty/promotions/promotionsRoutes"));
router.use("/rewards", require("../loyalty/rewards/rewardsRoutes"));
router.use("/club-collaborations", require("../loyalty/clubCollaborations/clubCollaborationsRoutes"));
router.use("/streaks", require("../loyalty/streaks/streaksRoutes"));
//users streaks
router.use("/users-streaks", require("../loyalty/usersStreaks/usersStreaksRoutes"));
router.use("/club-members", require("../loyalty/clubMembers/clubMembersRoutes"));
router.use("/points-calculator", require("./clubMembers/loyaltyPointsCalculatorRoutes"));
router.use("/referral", require("../loyalty/referral/loyaltyReferralRoutes"));
module.exports = router;
