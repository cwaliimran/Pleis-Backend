const mongoose = require("mongoose");
const { GlobalRecurringPromotionSchema } = require("./RecurringPromotionSchema");

const globalBasePromotionSchema = new mongoose.Schema(
  {
    image: { type: String, default: "" },
    title: { type: String, trim: true, required: true },
    description: { type: String, default: "" },

    globalPromotionType : {
      type: String,
      required: true,
      enum: ["globalHappyHour", "globalClaimPromotion", "buyMenuItemPromotion", "productSale"],
    },

    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },

    recurringDetails: {
      type: GlobalRecurringPromotionSchema,
      default: null,
    },

    tierLimit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tiers",
      default: null,
    },

    status: {
      type: String,
      enum: ["active", "inactive", "completed", "deleted"],
      default: "active",
    },
  },
  {
    timestamps: true,
    discriminatorKey: "globalPromotionType",
  }
);

module.exports =
  mongoose.models.GlobalBasePromotion ||
  mongoose.model("GlobalBasePromotion", globalBasePromotionSchema);
