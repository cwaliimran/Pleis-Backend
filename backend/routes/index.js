const express = require("express");
const router = express.Router();
router.use("/auth", require("./authRoutes"));
router.use("/users", require("./userRoutes"));
router.use("/upload", require("./uploadRoutes"));
router.use("/upload/s3", require("./uploadAWSRoutes"));
router.use("/settings", require("../admin/settings/adminSettingsRoutes"));
router.use("/communications", require("./communicationRoutes"));
router.use("/notifications", require("./notificationsRoutes"));
router.use("/support", require("./supportRoutes"));
router.use("/contact-us", require("./contactUsRoutes"));
router.use("/languages", require("./languageRoutes"));
router.use("/home", require("./homeRoutes"));
router.use("/util", require("./dbRoutes"));

//public routes
router.use("/suppliers", require("../admin/suppliers/suppliersRoutes"));

//locations
router.use("/locations", require("../shared/locations/routes"));

module.exports = router;
