// menuRoutes.js
const express = require("express");
const router = express.Router();

// Import individual route modules
router.use("/presets", require("../menuManagement/menuPreset/presetsRoutes"));
router.use("/items", require("../menuManagement/menuItems/menuItemsRoutes"));
router.use("/categories", require("../menuManagement/menuItemCategories/menuItemCategoriesRoutes"));
router.use("/", require("../menuManagement/menu/menusRoutes"));  // default "menu" route

module.exports = router;
