const mongoose = require("mongoose");
const { customAlphabet } = require("nanoid");
const generateChallengeOrderId = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);

const challengeOrderSchema = new mongoose.Schema(
  {
    bookingId: {
      type: String,
      index: true,
      default: () => `CHL-${generateChallengeOrderId()}`,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    challenge: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Challenge",
      required: true,
      index: true,
    },

    companyOrganizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Store snapshot so challenge updates don’t break previous progress
    challengeSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    // Track progress (varies by challenge type)
    progress: {
      current: { type: Number, default: 0 },
      target: { type: Number, default: 0 },
      // e.g. visit 2 times → target=2
    },

    // Reward claiming
    rewardClaimed: { type: Boolean, default: false },
    rewardClaimedAt: { type: Date, default: null },

    // State
    status: {
      type: String,
      enum: ["in-progress", "completed", "expired"],
      default: "in-progress",
    },
    milestonesSent: { //for notifications progress milestones
      type: [Number],
      default: []
    }
  },
  { timestamps: true }
);

challengeOrderSchema.index(
  { user: 1, challenge: 1, status: 1 }
);

challengeOrderSchema.index(
  { user: 1, status: 1, createdAt: -1 }
);

challengeOrderSchema.index(
  { challenge: 1, status: 1 }
);

challengeOrderSchema.index(
  { user: 1, challenge: 1, rewardClaimed: 1 }
);


const LoyaltyChallengesOrders = mongoose.model("LoyaltyChallengesOrder", challengeOrderSchema);

module.exports = { LoyaltyChallengesOrders };
