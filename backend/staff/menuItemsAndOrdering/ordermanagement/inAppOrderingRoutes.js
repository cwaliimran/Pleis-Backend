const express = require("express");
const {
  getOrders,
  updateOrders,
  updateIsOrderingEnabled,
} = require("./inAppOrderingController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const { editOrderFromStaffApp } = require("../../../commonModules/menuItemsAndOrders/orderEditController");

const router = express.Router();

// Create a rate limiter for Promo Codes
const OrdersRateLimiter = createRateLimiter("OrdersOfCustomers");

// router.post("/", roleMiddleware(["admin"]), OrdersRateLimiter, createOrders);
router.get("/", OrdersRateLimiter, getOrders);
router.put("/:id/edit", editOrderFromStaffApp); // Edit order before payment (#129, #130)
router.put("/:id", updateOrders);
router.post("/status", updateIsOrderingEnabled);




module.exports = router;
