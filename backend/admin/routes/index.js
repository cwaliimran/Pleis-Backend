const express = require("express");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");
const router = express.Router();
router.use("/", require("../../routes/index"));
router.use(auth, roleMiddleware(["admin"]));
router.use("/settings", require("../settings/adminSettingsRoutes"));
router.use("/suppliers", require("../suppliers/suppliersRoutes"));
router.use("/tag-types", require("../tagTypes/tagTypesRoutes"));
router.use("/tags", require("../tags/tagsRoutes"));
router.use("/categories", require("../categories/categoriesRoutes"));
router.use("/venues", require("../venues/venuesRoutes"));
router.use("/venue-types", require("../venueTypes/venueTypesRoutes"));
router.use("/features", require("../features/featureRoutes"));
router.use("/tiers", require("../tiers/tiersRoutes"));
router.use("/popular-events", require("../browserControl/popularEvents/popularEventsRoutes"));
router.use("/top-picks", require("../browserControl/topPicksOrganizations/topPicksOrganizationsRoutes"));
router.use("/custom-categories", require("../customCategories/customCategoriesRoutes"));
router.use("/pinned-content", require("../pinnedContent/pinnedContentRoutes"));
router.use("/banners", require("../bannerControl/bannerControlsRoutes"));
router.use("/users", require("../usersManagement/usersRoutes"));
router.use("/events", require("../events/eventRoutes"));

//menu management
router.use("/menu", require("../menuManagement/menuManagementRoutes"));
router.use("/notifications/", require("../notifications/notificationsRoutes"));

//organizations
router.use("/organizations", require("../organizations/organizationRoutes.js"));
//ticketings
router.use("/ticketing", require("../ticketing/ticketingsRoutes"));


//highlights
router.use("/highlights", require("../highlights/highlightRoutes"));

//loyalty
router.use("/loyalty", require("../loyalty/loyaltyRoutes"));

//loyalty
router.use("/global-loyalty", require("../globalLoyalty/loyaltyRoutes"));
// reservation
router.use("/reservations", require("../reservation/reservationRoutes"));
//status badges
router.use("/status-badges", require("../statusBadges/statusBadgesRoutes"));

//bundles
router.use("/bundles", require("../bundles/bundleRoutes"));

//Promo Codes
router.use("/promo-codes", require("../promoCode/promoCodeRoutes"));

// transactions
router.use("/transactions", require("../transactions/routes/unifiedTransactionsRoutes"));

// thirdPParty
router.use("/third-party", require("../thirdParty/thirdPartyRoutes"));
// thirdPParty
router.use("/referrals", require("../globalLoyalty/globalReferral/globalReferralRoutes"));
// thirdPParty
router.use("/marketing", require("../marketing/marketingRoutes"));

// thirdPParty
router.use("/subscriptions", require("../subscriptions/subscriptionsRoutes"));
// updates
router.use("/updates", require("../updates/updatesRoutes"));
router.use("/giveaways", require("../giveaways/giveawayRoutes"));
router.use("/qr-code", require("../qr/qrRoutes"));
router.use("/in-app-ordering", require("../inAppOrdering/inAppOrderingRoutes"));
router.use("/faqs", require("../faqs/faqsRoutes"));
router.use("/badge-categories", require("../badgeCategories/badgeCategoriesRoutes"));
router.use("/reviews", require("../reviews/reviewsRoutes"));



module.exports = router;
