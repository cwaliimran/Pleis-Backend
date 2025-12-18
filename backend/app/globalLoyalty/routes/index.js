const express = require("express");
const router = express.Router();

router.use("/wallet", require("../../../app/userWalletService/global/walletManagement/userWalletRoutes"));
router.use("/reward-categories", require("../globalRewardCategories/globalRewardCategoriesRoutes"));
router.use("/dashboard", require("../../../app/globalLoyalty/dashboard/dashboardsRoutes"));
router.use("/challenges", require("../../../app/globalLoyalty/challenges/challengesRoutes"));
// router.use("/rewards", require("../../../app/globalLoyalty/rewards/rewardsRoutes"));
// router.use("/reward-orders", require("../../../app/globalLoyalty/rewardOrders/rewardOrdersRoutes"));
router.use("/challenges-orders", require("../../../app/globalLoyalty/challengesOrders/challengesOrdersRoutes.js"));





module.exports = router;
