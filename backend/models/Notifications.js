const mongoose = require("mongoose");

// Define the NotificationTypes enum
const NotificationTypes = {
  NEW_MESSAGE: "newMessage",
  SYSTEM: "system",
  REMINDER: "reminder",
  EVENT_UPDATE: "eventUpdate",
  EVENT_DETAILS: "eventDetails",
  ORGANIZATION_DETAILS: "organizationDetails",
  HOME: "home",
  GIVEAWAY_UPDATE: "giveawayUpdate",
  CHALLENGE_UPDATE: "challengeUpdate",
  ORDER_UPDATE: "orderUpdate",
  PROMO_UPDATE: "promoUpdate",
  RESERVATION_UPDATE: "reservationUpdate",
  REFERRAL_UPDATE: "referralUpdate",
  TICKET_UPDATE: "ticketUpdate",
  FRIEND_REQUEST: "friendRequest",
  POINTS_UPDATE: "pointsUpdate",
  REWARD_CLAIMED: "rewardClaimed",
  MENU_ITEM_CREATED: "menuItemCreated",
  BADAGE_EARNED: "badgeEarned",
  REVIEW_UPDATED: "reviewUpdated",
  HIGHLIGHT_CREATED: "highlightCreated",
  SUPPORT_REQUEST: "supportRequest",
  NEW_MENU_ITEMS_ORDER: "newMenuItemsOrder",
  REWARD_REDEEMED: "rewardRedeemed",
  LEVEL_PROMOTED: "levelPromoted",
  LEVEL_DEMOTED: "levelDemomoted",
};

// Define the NotificationSchema
const NotificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: Object.values(NotificationTypes), // Reference the notification types enum
    required: true,
  },
  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User", // Reference to the sender (optional)
    default: null,
  },
  objectId: {
    type: mongoose.Schema.Types.ObjectId,
  },
  objectType: {
    type: String,
    required: true,
  },
  receiverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User", // Reference to the user for whom this notification is intended
    required: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  body: {
    type: String,
    required: true,
  },
  isRead: {
    type: Boolean,
    default: false,
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
  image: {
    type: String,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Automatically update `updatedAt` field on modification
NotificationSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// Export both Notification model and NotificationTypes enum
const NotificationExp = mongoose.model("Notification", NotificationSchema);
module.exports = {
  NotificationExp,
};
module.exports.NotificationTypes = NotificationTypes;
