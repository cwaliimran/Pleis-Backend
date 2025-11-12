const express = require("express");
const router = express.Router();

//common routes
router.use("/", require("./index"));
//home
router.use("/home", require("../app/home/homeRoutes"));
//maps
router.use("/maps", require("../app/maps/mapsRoutes"));
//organizations
router.use("/organizations", require("../app/organizationProfile/organizationProfileRoutes"));
//favorites
router.use("/favorites", require("../app/favorites/favoriteRoutes"));

//recently viewed items
router.use("/recently-viewed", require("../app/recentlyViewed/recentlyViewedItemRoutes"));

//events
router.use("/events", require("../app/events/eventRoutes"));

//loyalty
router.use("/loyalty/challenges", require("../app/loyalty/challenges/challengesRoutes"));
router.use("/loyalty/promotions", require("../app/loyalty/promotions/promotionsRoutes"));

router.use("/users", require("../app/usersManagement/usersRoutes"));

//menu items
router.use("/menu/items", require("../app/menuItemsAndOrdering/menuItems/menuItemsRoutes"));
router.use("/menu/orders", require("../app/menuItemsAndOrdering/orders/orderRoutes"));


module.exports = router;
