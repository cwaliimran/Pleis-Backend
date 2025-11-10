const express = require("express");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");
const router = express.Router();
router.use("/", require("../../routes/index"));
router.use(auth, roleMiddleware(["admin"]));
router.use("/settings", require("../settings/adminSettingsRoutes"));
router.use("/suppliers", require("../suppliers/suppliersRoutes"));
router.use("/tags", require("../tags/tagsRoutes"));
router.use("/categories", require("../categories/categoriesRoutes"));
router.use("/venues", require("../venues/venuesRoutes"));
router.use("/venue-types", require("../venueTypes/venueTypesRoutes"));
router.use("/features", require("../features/featureRoutes"));
router.use("/tiers", require("../tiers/tiersRoutes"));
router.use("/top-promos", require("../browserControl/top10PromoSection/topPromosRoutes"));
router.use("/custom-categories", require("../customCategories/customCategoriesRoutes"));
router.use("/pinned-content", require("../pinnedContent/pinnedContentRoutes"));
router.use("/banners", require("../bannerControl/bannerControlsRoutes"));
router.use("/users", require("../usersManagement/usersRoutes"));
router.use("/events", require("../events/eventRoutes"));

//menu management
router.use("/menu", require("../menuManagement/menuManagementRoutes"));

//organizations
router.use("/organizations", require("../organizations/organizationRoutes.js"));
//ticketings
router.use("/ticketing", require("../ticketing/ticketingsRoutes"));


//highlights
router.use("/highlights", require("../highlights/highlightRoutes"));

//locations
router.use("/locations", require("../../shared/locations/routes"));

//loyalty
router.use("/loyalty", require("../loyalty/loyaltyRoutes")); 



module.exports = router;
