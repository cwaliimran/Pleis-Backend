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

//recently viewed items
router.use("/recently-viewed", require("../commonModules/recentlyViewed/recentlyViewedItemRoutes"));

//events
router.use("/events", require("../app/events/eventRoutes"));

//loyalty
router.use("/loyalty/challenges", require("../app/loyalty/challenges/challengesRoutes"));
router.use("/loyalty/promotions", require("../app/loyalty/promotions/promotionsRoutes"));

module.exports = router;
