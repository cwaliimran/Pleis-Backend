const express = require("express");
const router = express.Router();

//common routes
router.use("/", require("../../routes/index"));
//loyalty routes
router.use("/loyalty", require("../../admin/loyalty/loyaltyRoutes"));
router.use("/suppliers", require("../suppliers/suppliersRoutes"));
router.use("/tags", require("../tags/tagsRoutes"));
router.use("/categories", require("../categories/categoriesRoutes"));
router.use("/venue-types", require("../venueTypes/venueTypesRoutes"));
router.use("/tiers", require("../tiers/tiersRoutes"));
router.use("/organizations", require("../organizations/organizationRoutes"));
router.use("/users", require("../../admin/usersManagement/usersRoutes"));
router.use("/updates", require("../updates/updatesRoutes"));
router.use("/marketing", require("../marketing/marketingRoutes"));
router.use("/giveaways", require("../giveaways/giveawayRoutes"));
router.use("/subscriptions", require("../subscriptions/subscriptionsRoutes"));
router.use("/reviews", require("../reviews/reviewsRoutes"));
router.use("/menu-management/items", require("../menuManagement/menuItems/menuItemsRoutes"));
router.use("/menu/categories", require("../../admin/menuManagement/menuItemCategories/menuItemCategoriesRoutes"));
router.use("/menu", require("../menuManagement/menu/menusRoutes"));
router.use("/qr-code", require("../qr/qrRoutes"));
router.use("/highlights", require("../highlights/highlightRoutes"));
router.use("/reservations", require("../../admin/reservation/reservationRoutes"));
router.use("/events", require("../events/eventRoutes"));
router.use("/venues", require("../venues/venuesRoutes"));
router.use("/ticketing", require("../../admin/ticketing/ticketingsRoutes"));
router.use("/promo-codes", require("../promoCode/promoCodeRoutes"));
router.use("/bundles", require("../bundles/bundleRoutes"));
router.use("/general", require("../generalAPIs/generalAPIRoutes"));
router.use("/in-app-ordering", require("../../admin/inAppOrdering/inAppOrderingRoutes"));
router.use("/transactions", require("../../admin/transactions/routes/unifiedTransactionsRoutes"));
router.use("/notifications", require("../../admin/notifications/notificationsRoutes"))
module.exports = router;