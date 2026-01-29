const mongoose = require("mongoose");

const GlobalRecurringPromotionSchema = new mongoose.Schema({
  isEnabled: {
    type: Boolean,
    default: false,
  },
  frequency: {
    type: String,
    enum: ["daily", "weekly", "monthly"],
    default: "daily",
  },
  interval: {
    type: Number,
    default: 1,
    min: 1,
  },
  daysOfWeek: {
    type: [String],
    enum: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    default: [],
  },
  endType: {
    type: String,
    enum: ["onDate"],
    default: "onDate",
  },
  endDate: {
    type: Date, // promotion endDate
  },
});

module.exports = {
  GlobalRecurringPromotionSchema,
};