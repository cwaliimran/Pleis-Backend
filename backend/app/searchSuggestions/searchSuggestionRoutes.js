const express = require("express");
const auth = require("../../middlewares/authMiddleware");
const createRateLimiter = require("../../helperUtils/rateLimiter");

const {
  recordUserSearch,
  getUserSearchHistory,
  getTrendingSearches,
} = require("./searchSuggestionController");

const router = express.Router();

const apiRateLimiter = createRateLimiter("SearchSuggestions");

router.use(auth);

router.post("/", apiRateLimiter, recordUserSearch);

router.get("/user", apiRateLimiter, getUserSearchHistory);

router.get("/trending", apiRateLimiter, getTrendingSearches);

module.exports = router;
