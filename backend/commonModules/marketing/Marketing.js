const mongoose = require("mongoose");
const validator = require("validator");

const MarketingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    title: {
      type: String,
      required: true,
    },

    description: {
      type: String,
      required: true,
    },

    budget: {
      type: Number,
      min: [0, "Budget must be positive"],
      required: true,
    },

    phoneNumber: {
      code: {
        // Country code for phone number
        type: String,
        default: "",
      },
      number: {
        // Phone number without country code
        type: String,
        default: "",
      },
      default: {},
    },

    email: {
      type: String,
      required: [true, "email_required"], // Generic error message key
      validate: {
        validator: function (value) {
          return validator.isEmail(value);
        },
        message: "email_invalid", // Generic error message key
      },
    },

    status: {
      type: String,
      enum: ["active", "pending", "rejected", "completed"],
      default: "pending",
    },
  },

  {
    timestamps: true,
  }
);

const Marketing = mongoose.model("Marketing", MarketingSchema);

module.exports = Marketing;
