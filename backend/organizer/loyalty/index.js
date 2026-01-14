const express = require("express");
const router = express.Router();


router.use("/rewards", require("./rewards/rewardsRoutes"));
router.use("/referral", require("./referral/loyaltyReferralRoutes"));
router.use("/streaks", require("./streaks/streaksRoutes"));
router.use("/users-streaks", require("./usersStreaks/usersStreaksRoutes"));
router.use("/club-members", require("../loyalty/clubMembers/clubMembersRoutes"));
router.use("/promotions", require("./promotions/promotionsRoutes"));
router.use("/challenges", require("./challenges/challengesRoutes"));
router.use("/transactions", require("./transsections/unifiedTransactionsRoutes"));
router.use("/club-collaborations", require("../loyalty/clubCollaborations/clubCollaborationsRoutes"));


module.exports = router;