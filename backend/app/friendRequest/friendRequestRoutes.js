const express = require("express");
const {
  getFriends,
  createFriendRequest,
  getFriendRequests,
  updateFriendRequests,
  unfriend,
  getSentFriendRequests
} = require("./friendRequestController"); // Assuming you have a separate controller for promo codes
const auth = require("../../middlewares/authMiddleware");
const router = express.Router();
router.use(auth);
// Search users (to send friend request)
router.get("/search", getFriends);

// Send a friend request
router.post("/", createFriendRequest);

// All requests I RECEIVED
router.get("/received", getFriendRequests);

// All requests I SENT
router.get("/sent", getSentFriendRequests);

// Update request (accept / reject)
router.put("/:id", updateFriendRequests);

// Unfriend
router.delete("/:id/unfriend", unfriend);


module.exports = router;
