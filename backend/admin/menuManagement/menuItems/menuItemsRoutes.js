const express = require("express");
const {
  createMenuItem,
  importMenuItems,
  getMenuItems,
  updateMenuItem,
  deleteMenuItem,
  getDeleteImpact,
  getMenuItemDetails,
  getMenuItemsByMenuId,
  getBundleMenuItems,
  updateSubCategoryBulk,
} = require("./menuItemsController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for MenuItems
const apiRateLimiter = createRateLimiter("MenuItems");
const apiRateLimiterDetails = createRateLimiter("MenuItems/:id");

router.post("/import", roleMiddleware(["admin", "organizer", "staff", "manager"]), importMenuItems);
// Create a new menuItem
router.post("/", roleMiddleware(["admin", "organizer", "staff", "manager"]), createMenuItem);
router.put(
  "/bulk",
  roleMiddleware(["admin", "organizer", "manager"]),
  updateSubCategoryBulk,
);
// Get all menuItems with pagination
router.get(
  "/",
  apiRateLimiter,
  roleMiddleware(["admin", "organizer", "staff", "manager"]),
  getMenuItems,
);
router.get(
  "/bundles",
  apiRateLimiter,
  roleMiddleware(["admin", "organizer", "staff", "manager"]),
  getBundleMenuItems,
);

//get menu items against menu id
router.get(
  "/menu/:menuId",
  apiRateLimiter,
  roleMiddleware(["admin", "organizer", "manager"]),
  getMenuItemsByMenuId,
);

//get menuItem details
router.get(
  "/:id",
  apiRateLimiterDetails,
  roleMiddleware(["admin", "organizer",  "manager"]),
  getMenuItemDetails,
);

// Update an existing menuItem
router.put("/:id", roleMiddleware(["admin", "organizer",  "manager"]), updateMenuItem);

//delete confirmation
router.get("/:id/delete-impact", apiRateLimiterDetails, roleMiddleware(["admin", "organizer",  "manager",]), getDeleteImpact);


// Delete a menuItem
router.delete("/:id", roleMiddleware(["admin", "organizer",  "manager"]), deleteMenuItem);


module.exports = router;
