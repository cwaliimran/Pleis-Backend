const express = require("express");
const {
  createMenu,
  getMenus,
  updateMenu,
  deleteMenu,
  getMenuDetails,
  duplicateMenuAndItems

} = require("./menusController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Menus
const apiRateLimiter = createRateLimiter("Menus");
const apiRateLimiterDetails = createRateLimiter("Menus/:id");
router.use("/items", require("../../../admin/menuManagement/menuItems/menuItemsRoutes"));
// Create a new menu
router.post("/", roleMiddleware(["admin", "organizer", "manager"]), createMenu);

// Get all menus with pagination
router.get("/", apiRateLimiter, getMenus);

//get menu details
router.get("/:id", apiRateLimiterDetails, getMenuDetails);

// Update an existing menu
router.put("/:id", roleMiddleware(["admin", "organizer", "staff", "manager"]), updateMenu);

// Delete a menu
router.delete("/:id", roleMiddleware(["admin", "organizer", "staff", "manager"]), deleteMenu);

//duplicate menu and its items
router.post(
  "/duplicate/:id",
  roleMiddleware(["admin", "organizer", "staff", "manager"]),
  duplicateMenuAndItems
);

module.exports = router;
