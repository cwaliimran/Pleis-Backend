const express = require("express");
const {
  getOrders,
  updateOrders,
  updateInAppOrders,
  getInAppOrders
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
router.put("/:id", roleMiddleware(["admin"]), updateOrders);
router.put("/update/:companyOrganizer", roleMiddleware(["admin"]), updateInAppOrders);
router.get("/update", roleMiddleware(["admin"]), getInAppOrders);




module.exports = router;
