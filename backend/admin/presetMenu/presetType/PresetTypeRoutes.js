const express = require("express");
const {
  createpresetType,
  getpresetTypes,
  getpresetTypeCode,
  updatepresetType,
  deletepresetType,
} = require("./PresetTypeController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Diet Tags
const presetTypeRateLimiter = createRateLimiter("presetType");

// Routes for Diet Tags Management
// Create a new Diet Tag
router.post("/", roleMiddleware(["admin"]), presetTypeRateLimiter, createpresetType);

// Get all Promo Codes with pagination
router.get("/", roleMiddleware(["admin","organizer"]), presetTypeRateLimiter, getpresetTypes);
router.get("/code", roleMiddleware(["admin"]), presetTypeRateLimiter, getpresetTypeCode);


// Update an existing Promo Code
router.put("/:id", roleMiddleware(["admin"]), updatepresetType);

// Delete a Promo Code
router.delete("/:id", roleMiddleware(["admin"]), deletepresetType);

module.exports = router;
