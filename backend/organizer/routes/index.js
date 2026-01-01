const express = require("express");
const router = express.Router();

//common routes
router.use("/", require("../../routes/index"));
//loyalty routes
router.use("/loyalty", require("../loyalty/index"));
router.use("/suppliers", require("../suppliers/suppliersRoutes"));
router.use("/tags", require("../tags/tagsRoutes"));
router.use("/categories", require("../categories/categoriesRoutes"));
router.use("/venue-types", require("../venueTypes/venueTypesRoutes"));
router.use("/tiers", require("../tiers/tiersRoutes"));
//organizations
router.use("/organizations", require("../organizations/organizationRoutes"));
//ticketings
// router.use("/ticketing", require("../ticketing/ticketingsRoutes"));
router.use("/users", require("../usersManagement/usersRoutes"));
router.use("/updates", require("../updates/updatesRoutes"));
router.use("/marketing", require("../marketing/marketingRoutes"));
router.use("/giveaways", require("../giveaways/giveawayRoutes"));
router.use("/subscriptions", require("../subscriptions/subscriptionsRoutes"));
router.use("/reviews", require("../reviews/reviewsRoutes"));





module.exports = router;