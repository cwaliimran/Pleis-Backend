const mongoose = require("mongoose");

const RecurringEventSchema = new mongoose.Schema({
  isEnabled: {
    type: Boolean,
    default: false,
  },
  frequency: {
    type: String,
    enum: ["daily", "weekly", "monthly"], // assuming future extensibility
    default: "daily",
  },
  interval: {
    type: Number,
    default: 1, // every 1 day by default
    min: 1,
  },
  daysOfWeek: {
    type: [String],
    enum: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    default: [], // E.g., ["mon", "wed", "fri"]
  },
  endType: {
    type: String,
    enum: ["never", "onDate", "afterOccurrences"],
    default: "never",
  },
  endDate: {
    type: Date, // Only required if endType === "onDate"
  },
  occurrences: {
    type: Number, // Only required if endType === "afterOccurrences"
    min: 1,
  },
});

 mongoose.model("RecurringEvent", RecurringEventSchema);

module.exports = {
  RecurringEventSchema,
};
