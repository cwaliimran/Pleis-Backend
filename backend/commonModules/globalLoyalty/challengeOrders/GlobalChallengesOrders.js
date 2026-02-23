/* ============================
   File: models/GlobalChallengeOrder.js
============================ */
const mongoose = require("mongoose");
const { customAlphabet } = require("nanoid");

const generateBookingId = customAlphabet(
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  6
);

const GlobalChallengeOrderSchema = new mongoose.Schema(
  {
    bookingId: {
      type: String,
      index: true,
      default: () => `GCH-${generateBookingId()}`,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // reference to original challenge (for analytics)
    challenge: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GlobalChallenge",
      required: true,
      index: true,
    },

    /**
     * Snapshot is CRITICAL
     * We NEVER trust live challenge after start
     */
    challengeSnapshot: {
      type: Object,
      required: true,
    },

    progress: {
      current: {
        type: Number,
        default: 0,
        min: 0,
      },
      target: {
        type: Number,
        required: true,
        min: 1,
      },
    },

    status: {
      type: String,
      enum: ["in-progress", "completed", "expired"],
      default: "in-progress",
      index: true,
    },

    /**
     * Reward claim handling (optional – future use)
     */
    rewardClaimed: {
      type: Boolean,
      default: false,
    },

    rewardClaimedAt: {
      type: Date,
      default: null,
    },

    milestonesSent: { // for notifications progress milestones
      type: [Number],
      default: []
    },

    // Ticket reward reference (if rewardType === specialTicket)
    rewardTicketOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TicketingOrder",
      default: null,
      index: true
    },

    // Ticket processing state (for retry & monitoring)
    ticketStatus: {
      type: String,
      enum: ["pending", "issued", "failed"],
      default: null,
      index: true
    },


  },
  {
    timestamps: true,
  }
);

/* ============================
   Indexes
============================ */
// Unique active protection + sorted lookup
GlobalChallengeOrderSchema.index(
  { user: 1, challenge: 1, status: 1, createdAt: -1 },
  {
    unique: true,
    partialFilterExpression: { status: "in-progress" }
  }
);

// Completed counting
GlobalChallengeOrderSchema.index(
  { user: 1, status: 1, challenge: 1 }
);

// Dashboard
GlobalChallengeOrderSchema.index(
  { user: 1, status: 1 }
);


const GlobalChallengesOrders = mongoose.model("GlobalChallengeOrder", GlobalChallengeOrderSchema);


module.exports = {
  GlobalChallengesOrders
};
