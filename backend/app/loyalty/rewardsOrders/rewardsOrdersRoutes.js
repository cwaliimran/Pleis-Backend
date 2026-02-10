const express = require("express");
const {
  getUserOrders,
  getOrderDetails
} = require("./rewardsOrdersController");

const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");

const router = express.Router();
router.use(auth);

const rateLimiter = createRateLimiter("RewardsOrders");

// Get user reward order history
router.get("/", rateLimiter, getUserOrders);
router.get("/:id", rateLimiter, getOrderDetails);

module.exports = router;
