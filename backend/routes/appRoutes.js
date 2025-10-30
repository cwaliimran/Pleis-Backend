// loyaltyRoutes.js
const express = require("express");
const router = express.Router();

//home
router.use("/home", require("../app/home/homeRoutes"));
//maps
router.use("/maps", require("../app/maps/mapsRoutes"));
//organizations
router.use("/organizations", require("../app/organizationProfile/organizationProfileRoutes"));
//favorites
router.use("/favorites", require("../commonModules/favorites/favoriteRoutes"));

module.exports = router;
