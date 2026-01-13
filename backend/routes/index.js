const express = require("express");
const router = express.Router();
router.use("/auth", require("./authRoutes"));
router.use("/upload", require("./uploadRoutes"));
router.use("/upload/azure", require("./uploadAzureBlobRoutes"));
router.use("/settings", require("../admin/settings/adminSettingsRoutes"));
router.use("/communications", require("./communicationRoutes"));
router.use("/notifications", require("./notificationsRoutes"));
// router.use("/support", require("./supportRoutes"));
router.use("/contact-us", require("./contactUsRoutes"));
router.use("/languages", require("./languageRoutes"));
// router.use("/util", require("./dbRoutes"));

router.use("/dashboard", require("../admin/dashboard/dashboardsRoutes"));

//global routes
router.use("/suppliers", require("../admin/suppliers/suppliersRoutes"));
router.use("/tags-types", require("../admin/tagTypes/tagTypesRoutes"));
router.use("/tags", require("../admin/tags/tagsRoutes"));
router.use("/categories", require("../admin/categories/categoriesRoutes"));
router.use("/venue-types", require("../admin/venueTypes/venueTypesRoutes"));
//locations
router.use("/locations", require("../shared/locations/routes"));


//helper route for generating shareable links
router.use("/share", require("./shareRoute"));


module.exports = router;
