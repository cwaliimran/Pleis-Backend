const express = require("express");
const router = express.Router();

// router.post("/", roleMiddleware(["admin"]), OrdersRateLimiter, createOrders);
router.use("/ordermanagement",require("./ordermanagement/inAppOrderingRoutes"));





module.exports = router;
