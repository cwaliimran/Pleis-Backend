const express = require("express");
const {
  createClubCollaboration,
  getClubCollaborations,
  updateClubCollaboration,
  deleteClubCollaboration,
  getClubCollaborationDetails,
} = require("./clubCollaborationsController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for ClubCollaborations
const apiRateLimiter = createRateLimiter("ClubCollaborations");
const apiRateLimiterDetails = createRateLimiter("ClubCollaborations/:id");

// Create a new clubCollaboration
router.post("/", roleMiddleware(["admin", "organizer", "manager"]),auth, createClubCollaboration);

// Get all clubCollaborations with pagination
router.get("/", apiRateLimiter, getClubCollaborations);

//get clubCollaboration details
router.get("/:id", apiRateLimiterDetails, auth, getClubCollaborationDetails);

// Update an existing clubCollaboration
router.put("/:id", roleMiddleware(["admin", "organizer", "manager"]),auth, updateClubCollaboration);

// Delete a clubCollaboration
router.delete("/:id", roleMiddleware(["admin", "organizer", "manager"]),auth, deleteClubCollaboration);

module.exports = router;
