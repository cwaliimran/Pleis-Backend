const express = require("express");
const {
  getCountries,
  getStatesByCountryId,
  getCitiesByStateId,
  getCitiesByCountryId,
} = require("./controller");
const createRateLimiter = require("../../helperUtils/rateLimiter");

const router = express.Router();
const apiRateLimiter = createRateLimiter("countries");
// Define routes for countries, states, and cities
router.get("/countries", apiRateLimiter, getCountries);
router.get("/states/:countryId", apiRateLimiter, getStatesByCountryId);
router.get("/cities/:stateId", apiRateLimiter, getCitiesByStateId);
router.get("/cities/country/:countryId", apiRateLimiter, getCitiesByCountryId);

module.exports = router;
