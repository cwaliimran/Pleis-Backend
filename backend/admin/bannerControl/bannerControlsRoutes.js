const express = require("express");
const {
  createBannerControls,
  getBannerControls,
  updateBannerControls,
  deleteBannerControls,
  reorderBannerControls,
} = require("./bannerControlsController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for BannerControls
const apiRateLimiter = createRateLimiter("BannerControls");

// Create a new bannerControls
router.post("/", roleMiddleware(["admin"]), createBannerControls);

// Get all bannerControls with pagination
router.get("/", apiRateLimiter, getBannerControls);

// Update an existing bannerControls
router.put("/:id", roleMiddleware(["admin"]), updateBannerControls);

// Delete a bannerControls
router.delete("/:id", roleMiddleware(["admin"]), deleteBannerControls);

// Reorder bannerControls
router.post("/reorder", roleMiddleware(["admin"]), reorderBannerControls);

module.exports = router;
