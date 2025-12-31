const express = require("express");
const {
  createTagsType,
  getTagsTypes,
  getPublicTagsTypes,
  updateTagsType,
  deleteTagsType,
} = require("./tagTypesController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const roleMiddleware = require("../../middlewares/roleMiddleware");
const auth = require("../../middlewares/authMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for TagsTypes
const apiRateLimiter = createRateLimiter("TagsTypes");
//public routes
router.get("/global", apiRateLimiter, getPublicTagsTypes);

// Create a new Tagstype
router.post("/", roleMiddleware(["admin"]), createTagsType);

// Get all Tagstypes with pagination
router.get("/", getTagsTypes);

// Update an existing Tagstype
router.put("/:id", roleMiddleware(["admin"]), updateTagsType);

// Delete a Tagstype
router.delete("/:id", roleMiddleware(["admin"]), deleteTagsType);

module.exports = router;
