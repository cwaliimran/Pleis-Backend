const express = require("express");
const router = express.Router();
router.use("/settings", require("../settings/adminSettingsRoutes"));
router.use("/suppliers", require("../suppliers/suppliersRoutes"));
router.use("/tags", require("../tags/tagsRoutes"));
router.use("/categories", require("../categories/categoriesRoutes"));
router.use("/venue-types", require("../venueTypes/venueTypesRoutes"));
router.use("/features", require("../features/featureRoutes"));
router.use("/users", require("../usersManagement/usersRoutes"));

module.exports = router;
