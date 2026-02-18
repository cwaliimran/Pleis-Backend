const express = require("express");
const {
  createNotifications,
  getNotificationss,
  updateNotifications,
  deleteNotifications,
  getOrganizations,
  getEvents,
  gettags
} = require("./notificationsController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);
const NotificationsRateLimiter = createRateLimiter("Notificationss");
router.post("/", roleMiddleware(["admin"]), NotificationsRateLimiter, createNotifications);
router.get("/all", roleMiddleware(["admin"]), NotificationsRateLimiter, getNotificationss);
router.get("/organizations", roleMiddleware(["admin", "organizer"]), NotificationsRateLimiter, getOrganizations);
router.get("/events", roleMiddleware(["admin"]), NotificationsRateLimiter, getEvents);
router.put("/:id", roleMiddleware(["admin"]), updateNotifications);
router.delete("/:id", roleMiddleware(["admin"]), deleteNotifications);
router.get("/tags", roleMiddleware(["admin"]), NotificationsRateLimiter, gettags);

module.exports = router;
