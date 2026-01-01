const express = require("express");
const router = express.Router();

//common routes
router.use("/", require("./index"));
//home
router.use("/home", require("../app/home/homeRoutes"));

//popular events routes
router.use("/popular-events", require("../app/popularEvents/popularEventsRoutes"));
router.use("/top-picks-organizations", require("../app/topPicksOrganizations/topPicksOrganizationsRoutes"));

//maps
router.use("/maps", require("../app/maps/mapsRoutes"));
//organizations
router.use("/organizations", require("../app/organizationProfile/organizationProfileRoutes"));
//favorites
router.use("/favorites", require("../app/favorites/favoriteRoutes"));

//events
router.use("/events", require("../app/events/eventRoutes"));

//loyalty
router.use("/loyalty/calculate-points", require("../app/loyalty/calculatePointsEarning/pointsEarningsRoutes"));
router.use("/loyalty/dashboard", require("../app/loyalty/dashboard/dashboardsRoutes"));
router.use("/loyalty/challenges", require("../app/loyalty/challenges/challengesRoutes"));
router.use("/loyalty/promotions", require("../app/loyalty/promotions/promotionsRoutes"));
router.use("/loyalty/club", require("../app/loyalty/clubMembers/clubMembersRoutes"));
router.use("/loyalty/rewards", require("../app/loyalty/rewards/rewardsRoutes"));
router.use("/loyalty/rewards-orders", require("../app/loyalty/rewardsOrders/rewardsOrdersRoutes"));
router.use("/loyalty/challenges-orders", require("../app/loyalty/challengesOrders/challengesOrdersRoutes"));

router.use("/users", require("../app/usersManagement/usersRoutes"));

//menu items
router.use("/menu/items", require("../app/menuItemsAndOrdering/menuItems/menuItemsRoutes"));
router.use("/menu/orders", require("../app/menuItemsAndOrdering/orders/orderRoutes"));
//users streaks
router.use("/checkin", require("../app/usersStreaks/usersStreaksRoutes"));



// reservatio
router.use("/reservations", require("../app/reservations/reservationRoutes"));
//Promo Codes
router.use("/promo-codes", require("../app/promoCode/promoCodeRoutes"));
//Promo Codes
router.use("/global-referral", require("../app/globalReferral/globalReferralRoutes"));

//ticketing bookings
router.use("/ticketing-bookings", require("../app/bookings/ticketings/ticketingBookingRoutes"));
//transactions
router.use("/transactions", require("../app/userWalletService/transactions/routes/unifiedTransactionsRoutes"));
//transactions
router.use("/friend-request", require("../app/friendRequest/friendRequestRoutes"));
//friends-suggestions
router.use("/friends-suggestions", require("../app/friendsSuggestion/friendsSuggestionRoutes"));

router.use("/global-loyalty", require("../app/globalLoyalty/routes/index"));
router.use("/giveaways", require("../app/giveaways/giveawayRoutes"));
router.use("/qr-code", require("../app/qrCode/qrCodeRoutes"));
router.use("/support", require("../app/support/supportRoutes"));
router.use("/faqs", require("../app/faqs/faqsRoutes"));
router.use("/loyalty-referral", require("../app/loyaltyReferral/loyaltyReferralRoutes"));
router.use("/reviews", require("../app/reviews/reviewsRoutes"));




module.exports = router;
