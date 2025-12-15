const mongoose = require("mongoose");
const { nanoid } = require("nanoid");

const giveawaySchema = new mongoose.Schema(
  {
        title: {
      type: String,
      required: true,
      trim: true,
      default: "",},
    // Public identifier
    publicId: {
      type: String,
      unique: true,
      index: true,
      default: () => nanoid(),
    },

    // Event reference
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },

    // Ticket reference
    ticket: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ticketings",
      required: true,
    },

    // Number of winners
    numberOfWinners: {
      type: Number,
      required: true,
      min: 1,
    },

    // Tickets given to each winner
    ticketsPerWinner: {
      type: Number,
      required: true,
      min: 1,
    },

    // Giveaway creator (Organizer / Admin / User)
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organizations",
      required: true,
    },

    // Giveaway duration
startDateTime: {
  type: Date,
  default: Date.now, 
},

    endDateTime: {
      type: Date,
      required: true,
    },


    // Giveaway status
    status: {
      type: String,
      enum: ["active", "inactive", "deleted"],
      default: "active",
    },
        giveawayStatus: {
      type: String,
      enum: ["live", "completed", "ended", "upcoming"],
      default: "live",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Giveaway", giveawaySchema);
