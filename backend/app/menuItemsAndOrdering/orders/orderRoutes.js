const express = require("express");
const auth = require("../../../middlewares/authMiddleware");
const { placeOrder, getOrderDetails, getUserOrders } = require("./orderController");

const router = express.Router();

router.use(auth);

// Place a new order
router.post("/", placeOrder);

// Get details of an order
router.get("/:id", getOrderDetails);

// Get all orders of logged-in user
router.get("/", getUserOrders);

module.exports = router;
