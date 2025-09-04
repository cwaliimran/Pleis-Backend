const express = require("express");
const router = express.Router();
router.use("/auth", require("./authRoutes"));
router.use("/users", require("../commonModules/usersManagement/usersRoutes"));
router.use("/upload", require("./uploadRoutes"));
router.use("/upload/azure", require("./uploadAzureBlobRoutes"));
router.use("/settings", require("../admin/settings/adminSettingsRoutes"));
router.use("/communications", require("./communicationRoutes"));
router.use("/notifications", require("./notificationsRoutes"));
router.use("/support", require("./supportRoutes"));
router.use("/contact-us", require("./contactUsRoutes"));
router.use("/languages", require("./languageRoutes"));
router.use("/home", require("./homeRoutes"));
router.use("/util", require("./dbRoutes"));

//organizer routes
router.use("/organizations", require("../commonModules/organizations/organizationRoutes"));

//global routes
router.use("/suppliers", require("../admin/suppliers/suppliersRoutes"));
router.use("/tags", require("../admin/tags/tagsRoutes"));
router.use("/categories", require("../admin/categories/categoriesRoutes"));
router.use("/venue-types", require("../admin/venueTypes/venueTypesRoutes"));
router.use("/venues", require("../commonModules/venues/venuesRoutes"));
router.use("/features", require("../admin/features/featureRoutes"));
//events
router.use("/events", require("../commonModules/events/eventRoutes"));
//highlights
router.use("/highlights", require("../commonModules/highlights/highlightRoutes"));

//locations
router.use("/locations", require("../shared/locations/routes"));


module.exports = router;
