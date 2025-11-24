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
router.use("/loyalty/club", require("../app/loyalty/clubMembers/clubMembersRoutes"));

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
router.use("/transactions", require("../app/bookings/transactions/transactionsRoutes"));
//transactions
router.use("/friend-request", require("../app/friendRequest/friendRequestRoutes"));
//friends-suggestions
router.use("/friends-suggestions", require("../app/friendsSuggestion/friendsSuggestionRoutes"));


router.use("/global-loyalty/wallet", require("../app/userWalletService/walletManagement/userWalletRoutes"));
//global loyalty wallet transactions
router.use("/global-loyalty/wallet-transactions", require("../app/userWalletService/walletTransactions/globalTransactionsRoutes"));



module.exports = router;
