const mongoose = require("mongoose");

const giveawayParticipantSchema = new mongoose.Schema(
  {
    // Giveaway reference
    giveaway: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Giveaway",
      required: true,
    },

    // User reference
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Organization reference
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organizations",
      required: true,
    },

    // Winner flag
    isWinner: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Prevent duplicate participation
giveawayParticipantSchema.index(
  { giveaway: 1, user: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  "GiveawayParticipant",
  giveawayParticipantSchema
);
