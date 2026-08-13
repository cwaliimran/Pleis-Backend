const express = require("express");
const auth = require("../../../middlewares/authMiddleware");
const {
  placeOrder,
  getOrderDetails,
  getUserOrders,
  addMoreItemsToOrder,
  updateOrderDetails,
} = require("./orderController");

const router = express.Router();

router.use(auth);

// Place a new order
router.post("/", placeOrder);
router.post("/add-more", addMoreItemsToOrder);

// Get details of an order
router.get("/:id", getOrderDetails);
router.put("/:id", updateOrderDetails);

// Get all orders of logged-in user
router.get("/", getUserOrders);

module.exports = router;
