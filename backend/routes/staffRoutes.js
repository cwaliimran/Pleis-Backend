const express = require("express");
const roleMiddleware = require("../middlewares/roleMiddleware");
const auth = require("../middlewares/authMiddleware");
const { completeRewardOrder } = require("../staff/loyalty/rewardorders/rewardsOrdersController");
const router = express.Router();

router.use(auth);
router.use(roleMiddleware(["staff"]));
router.use("/organizations", require("../staff/organizations/organizationRoutes"));
//menue items 
router.use("/menu-items", require("../staff/menuItemsAndOrdering/menuItems/menuItemsRoutes"));
//in app ordering
router.use("/in-app-ordering", require("../staff/menuItemsAndOrdering/ordermanagement/inAppOrderingRoutes"));
//transactions and points
router.use("/points", require("../staff/transactions/transactionsRoutes"));
//scan qr code
router.use("/scan-qr", require("../staff/scanQrCode/scanQrRoutes"));
//complete reward order
router.put("/loyalty/reward-orders", completeRewardOrder);
//events
router.use("/events", require("../staff/events/eventRoutes"));
//reservations
router.use("/reservations", require("../admin/reservation/reservationRoutes"));
router.use("/reservations-booking", require("../staff/reservations/reservationRoutes"));
// router.use("/orders", require("../staff/menuItemsAndOrdering/orders/orderRoutes"));



module.exports = router;