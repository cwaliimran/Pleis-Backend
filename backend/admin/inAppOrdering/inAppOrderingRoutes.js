const express = require("express");
const router = express.Router();

// router.post("/", roleMiddleware(["admin"]), OrdersRateLimiter, createOrders);
router.use("/ordermanagement",require("./ordermanagement/inAppOrderingRoutes"));
router.use("/menu-management",require("./menuManagement/menuManagementRoutes"));
router.use("/analytics", require("./analytics/analyticsRoutes"));
router.use("/settings", require("./settings/setting/settingRoutes"));


module.exports = router;
