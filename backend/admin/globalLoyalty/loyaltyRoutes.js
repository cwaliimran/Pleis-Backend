// loyaltyRoutes.js
const express = require("express");
const router = express.Router();

router.use("/status-levels", require("./statusLevels/globalStatusLevelsRoutes"));
// global reward categories
router.use("/reward-categories", require("./globalRewardCategories/globalRewardCategoriesRoutes"));
// global Loyalty reward
router.use("/reward", require("../globalLoyalty/rewards/rewardsRoutes"));

// global Loyalty reward
router.use("/challanges", require("../globalLoyalty/challenges/challengesRoutes"));

// global Promotions
router.use("/promotions", require("../globalLoyalty/promotions/promotionsRoutes"));

// global streaks
router.use("/streaks", require("../globalLoyalty/streaks/streaksRoutes"));
router.use("/users-streaks", require("../globalLoyalty/usersStreaks/usersStreaksRoutes"));
//listings
router.use("/listings", require("../globalLoyalty/listings/listingsRoutes"));
//members
router.use("/listings", require("../globalLoyalty/listings/listingsRoutes"));
//members
router.use("/club-members", require("../globalLoyalty/clubMembers/clubMembersRoutes"));

//transactions
router.use("/referrals", require("../globalLoyalty/globalReferral/globalReferralRoutes"));
module.exports = router;
