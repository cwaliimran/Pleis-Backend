const express = require("express");
const {
  createPreset,
  getPresets,
  updatePreset,
  deletePreset,
  getPresetDetails,
} = require("./presetsController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Presets
const apiRateLimiter = createRateLimiter("Presets");
const apiRateLimiterDetails = createRateLimiter("Presets/:id");

// Create a new preset
router.post("/", roleMiddleware(["admin"]), createPreset);

// Get all presets with pagination
router.get("/", apiRateLimiter, getPresets);

//get preset details
router.get("/:id", apiRateLimiterDetails, getPresetDetails);

// Update an existing preset
router.put("/:id", roleMiddleware(["admin"]), updatePreset);

// Delete a preset
router.delete("/:id", roleMiddleware(["admin"]), deletePreset);

module.exports = router;
