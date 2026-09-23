const express = require("express");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");
const {
  placeOrder,
  getOrderDetails,
  getUserOrders,
  addMoreItemsToOrder,
  updateOrderDetails,
} = require("./orderController");

const router = express.Router();

router.use(auth);

// Guests cannot place or extend orders — registered app users only
const requireAppUser = roleMiddleware(["user", "staff", "admin", "manager"]);

// Place a new order
router.post("/", requireAppUser, placeOrder);
router.post("/add-more", requireAppUser, addMoreItemsToOrder);

// Get details of an order
router.get("/:id", getOrderDetails);
router.put("/:id", updateOrderDetails);

// Get all orders of logged-in user
router.get("/", getUserOrders);

module.exports = router;
