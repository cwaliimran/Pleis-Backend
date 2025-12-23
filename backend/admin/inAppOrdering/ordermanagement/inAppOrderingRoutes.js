const express = require("express");
const {
  createOrders,
  getOrders,
  updateOrders,
  deleteOrders,
  getevents,
  gettickets,
  getWinners,
} = require("./inAppOrderingController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);



// Create a rate limiter for Promo Codes
const OrdersRateLimiter = createRateLimiter("Orders");

// router.post("/", roleMiddleware(["admin"]), OrdersRateLimiter, createOrders);
router.get("/", roleMiddleware(["admin"]), OrdersRateLimiter, getOrders);
router.get("/winners", roleMiddleware(["admin"]), OrdersRateLimiter, getWinners);
router.delete("/:id", roleMiddleware(["admin"]), deleteOrders);
router.put("/:id", roleMiddleware(["admin"]), updateOrders);




module.exports = router;
