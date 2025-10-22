const express = require("express");
const router = express.Router();
router.use("/settings", require("../settings/adminSettingsRoutes"));
router.use("/suppliers", require("../suppliers/suppliersRoutes"));
router.use("/tags", require("../tags/tagsRoutes"));
router.use("/categories", require("../categories/categoriesRoutes"));
router.use("/venue-types", require("../venueTypes/venueTypesRoutes"));
router.use("/features", require("../features/featureRoutes"));
router.use("/tiers", require("../tiers/tiersRoutes"));
router.use("/top-promos", require("../browserControl/top10PromoSection/topPromosRoutes"));
router.use("/custom-categories", require("../customCategories/customCategoriesRoutes"));
router.use("/pinned-content", require("../pinnedContent/pinnedContentRoutes"));
router.use("/banners", require("../bannerControl/bannerControlsRoutes"));

module.exports = router;
