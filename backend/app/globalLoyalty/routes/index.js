const express = require("express");
const router = express.Router();

router.use("/wallet", require("../../../app/userWalletService/global/walletManagement/userWalletRoutes"));
router.use("/reward-categories", require("../globalRewardCategories/globalRewardCategoriesRoutes"));
router.use("/dashboard", require("../../../app/globalLoyalty/dashboard/dashboardsRoutes"));
router.use("/challenges", require("../../../app/globalLoyalty/challenges/challengesRoutes"));
router.use("/rewards", require("../../../app/globalLoyalty/rewards/rewardsRoutes"));
router.use("/rewards-orders", require("../../../app/globalLoyalty/rewardsOrders/rewardsOrdersRoutes"));
router.use("/challenges-orders", require("../../../app/globalLoyalty/challengesOrders/challengesOrdersRoutes.js"));
router.use("/promotions", require("../../../app/globalLoyalty/promotions/promotionsRoutes"));
router.use("/status-levels", require("../../../app/globalLoyalty/statusLevels/globalStatusLevelsRoutes.js"));





module.exports = router;
