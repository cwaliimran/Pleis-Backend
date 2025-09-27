// menuRoutes.js
const express = require("express");
const router = express.Router();

// Import individual route modules
router.use("/presets", require("../commonModules/menuManagement/menuPreset/presetsRoutes"));
router.use("/items", require("../commonModules/menuManagement/menuItems/menuItemsRoutes"));
router.use("/categories", require("../commonModules/menuManagement/menuItemCategories/menuItemCategoriesRoutes"));
router.use("/", require("../commonModules/menuManagement/menu/menusRoutes"));  // default "menu" route

module.exports = router;
