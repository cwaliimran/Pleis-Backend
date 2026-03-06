// models/UserMonthlySpend.js
const mongoose = require("mongoose");

const UserMonthlySpendSchema = new mongoose.Schema(
{
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    index: true,
    required: true
  },

  year: {
    type: Number,
    required: true,
    index: true
  },

  month: {
    type: Number, // 1–12
    required: true,
    index: true
  },

  totalSpent: {
    type: Number,
    default: 0
  }

},
{ timestamps: true }
);

UserMonthlySpendSchema.index(
  { user: 1, year: 1, month: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  "UserMonthlySpend",
  UserMonthlySpendSchema
);