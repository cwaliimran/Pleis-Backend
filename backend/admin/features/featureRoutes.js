const express = require("express");
const {
  createFeature,
  getFeatures,
  updateFeature,
  deleteFeature,
  getFeatureDetails,
  getPublicFeatures
} = require("./featureController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Features
const apiRateLimiter = createRateLimiter("Features");

// Create a new feature
router.post("/", roleMiddleware(["admin"]), createFeature);

// Get all features with pagination
router.get("/", apiRateLimiter, getFeatures);

// Get public features
router.get("/global", apiRateLimiter, getPublicFeatures);

//get feature details
router.get("/:id", getFeatureDetails);

// Update an existing feature
router.put("/:id", roleMiddleware(["admin"]), updateFeature);

// Delete a feature
router.delete("/:id", roleMiddleware(["admin"]), deleteFeature);

module.exports = router;
