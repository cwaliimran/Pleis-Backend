const mongoose = require("mongoose");

const settingSchema = new mongoose.Schema(
  {
    companyOrganizer: {
      // creator
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    paymentMethod: {
      inAppPayment: {
        type: Boolean,
        default: true,
      },
      payNow: {
        type: Boolean,
        default: false,
      },
      cash: {
        type: Boolean,
        default: false,
      },
    },
    automaticOrderAcceptance: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

module.exports =
  mongoose.models.Setting || mongoose.model("Setting", settingSchema);
