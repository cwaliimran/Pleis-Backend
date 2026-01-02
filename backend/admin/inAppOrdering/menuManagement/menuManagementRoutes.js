const express = require("express");
const {
  createMenu,
  getMenu,
  updateMenu,
  deleteMenu,
  getevents,
  gettickets,
  getWinners,
} = require("./menuManagementController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);



// Create a rate limiter for Promo Codes
const MenuRateLimiter = createRateLimiter("Menu");

// router.post("/", roleMiddleware(["admin"]), MenuRateLimiter, createMenu);
router.get("/", roleMiddleware(["admin"]), getMenu);
router.put("/:id", roleMiddleware(["admin"]), updateMenu);




module.exports = router;
