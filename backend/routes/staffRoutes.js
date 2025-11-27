const express = require("express");
const router = express.Router();

//organizations
router.use("/organizations", require("../staff/organizations/organizationRoutes"));
//menue items 
router.use("/menu-items", require("../staff/menuItemsAndOrdering/menuItems/menuItemsRoutes"));
router.use("/orders", require("../staff/menuItemsAndOrdering/orders/orderRoutes"));



module.exports = router;