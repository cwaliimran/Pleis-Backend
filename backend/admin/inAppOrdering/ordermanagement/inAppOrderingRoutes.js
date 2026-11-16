const express = require("express");
const {
  getOrders,
  updateOrders,
  updateInAppOrders,
  getInAppOrders,
  sendPaymentReminder,
} = require("./inAppOrderingController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");
const { editOrderFromAdmin } = require("../../../commonModules/menuItemsAndOrders/orderEditController");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Promo Codes
const OrdersRateLimiter = createRateLimiter("Orders");

// router.post("/", roleMiddleware(["admin"]), OrdersRateLimiter, createOrders);
router.get("/", roleMiddleware(["admin", "organizer"]), OrdersRateLimiter, getOrders);
router.put("/update/:organization", roleMiddleware(["admin", "organizer"]), updateInAppOrders);
router.put("/:id", roleMiddleware(["admin", "organizer"]), updateOrders);
// Edit order before payment (#129, #130). update-order kept for the current
// admin panel; it used to run the guest's update without the payment lock.
router.put("/update-order/:id", roleMiddleware(["admin", "organizer"]), editOrderFromAdmin);
router.put("/:id/edit", roleMiddleware(["admin", "organizer"]), editOrderFromAdmin);
router.get("/update", roleMiddleware(["admin", "organizer"]), getInAppOrders);
router.get("/reminder", roleMiddleware(["admin", "organizer"]), sendPaymentReminder);

module.exports = router;
