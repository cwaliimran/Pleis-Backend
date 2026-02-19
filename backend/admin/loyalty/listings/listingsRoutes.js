const express = require("express");
const {
  getListings,
} = require("./listingsController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");
const router = express.Router();

router.use(auth);

const apiRateLimiter = createRateLimiter("Listings");

router.get("/", roleMiddleware(["admin","organizer"]), apiRateLimiter, getListings);

module.exports = router;
