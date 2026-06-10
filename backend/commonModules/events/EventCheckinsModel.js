const mongoose = require("mongoose");

const eventCheckinsSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        organization: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organizations",
            required: true,
            index: true,
        },

        companyOrganizer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        event: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Event",
            required: true,
            index: true,
        },

        checkedInAt: {
            type: Date,
            default: Date.now,
            index: true,
        },

        source: {
            type: String,
            enum: ["ticket", "reservation", "walkin"],
            default: "walkin",
        },
    },
    { timestamps: true }
);

eventCheckinsSchema.index(
  {
    event: 1,
    user: 1,
  },
  {
    unique: true,
  }
);
const EventCheckins = mongoose.model("EventCheckin", eventCheckinsSchema);


module.exports = {
    EventCheckins,
};