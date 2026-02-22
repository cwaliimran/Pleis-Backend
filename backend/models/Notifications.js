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
  TICKET_CONFIRMED: "ticketConfirmed",
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
  MENU_ORDER_CONFIRMED: "menuOrderConfirmed",
  MENU_ORDER_CANCELLED: "menuOrderCancelled",
  MENU_ORDER_SENT: "menuOrderSent",
  MENU_ORDER_COMPLETED: "menuOrderCompleted",
  TICKET_CANCELLED: "ticketCancelled",
  EVENT_CANCELLED: "eventCancelled",
  EVENT_RESCHEDULED: "eventRescheduled",
  EVENT_STARTING_24H: "eventStarting24h",
  EVENT_STARTING_2H: "eventStarting2h",
  EVENT_STARTED: "eventStarted",
  RESERVATION_CONFIRMED: "reservationConfirmed",
  RESERVATION_CANCELLED: "reservationCancelled",
  RESERVATION_REJECTED: "reservationRejected",
  RESERVATION_TIMING_CHANGED: "reservationTimingChanged",
  RESERVATION_CHECKED_IN: "reservationCheckedIn",
  RESERVATION_COMPLETED: "reservationCompleted",
  CHALLENGE_STARTED: "challengeStarted",
  CHALLENGE_COMPLETED: "challengeCompleted",
  CHALLENGE_PROGRESS_MILESTONE: "challengeProgressMilestone",
  CHALLENGE_REWARD_UNLOCKED: "challengeRewardUnlocked",
  CHALLENGE_EXPIRING_SOON: "challengeExpiringSoon",
  GLOBAL_CHALLENGE_STARTED: "globalChallengeStarted",
  GLOBAL_CHALLENGE_PROGRESS_MILESTONE: "globalChallengeProgressMilestone",
  GLOBAL_CHALLENGE_COMPLETED: "globalChallengeCompleted",
  GLOBAL_CHALLENGE_BATCH_UPDATE: "globalChallengeBatchUpdate",


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
  // flexible metadata
  meta: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
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
