const express = require("express");
const roleMiddleware = require("../middlewares/roleMiddleware");
const auth = require("../middlewares/authMiddleware");
const router = express.Router();

router.use(auth);
router.use(roleMiddleware(["staff"]));
router.use("/organizations", require("../staff/organizations/organizationRoutes"));
//menue items 
router.use("/menu-items", require("../staff/menuItemsAndOrdering/menuItems/menuItemsRoutes"));
router.use("/points", require("../staff/transactions/transactionsRoutes"));
// router.use("/orders", require("../staff/menuItemsAndOrdering/orders/orderRoutes"));



module.exports = router;