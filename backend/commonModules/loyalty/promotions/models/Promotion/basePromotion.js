const mongoose = require("mongoose");
const { RecurringPromotionSchema } = require("./RecurringPromotionSchema");

const basePromotionsSchema = new mongoose.Schema(
  {
    image: {
      type: String,
      default: "",
    },
    title: { type: String, trim: true, required: true },
    description: { type: String, default: "" },
    promotionType: {
      type: String,
      required: true,
      enum: ["happyHour", "claimPromotion", "buyMenuItemPromotion", "productSale"],
    },

    startDate: { type: Date, default: null }, //contains date/time in happyHour case otherwise just date
    endDate: { type: Date, default: null },
    
    recurringDetails: {
      type: RecurringPromotionSchema,
      default: null,
    },

    tierLimit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tiers",
      default: null,
    },

    companyOrganizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      required: true,
    },

    status: {
      type: String,
      enum: ["active", "inactive", "completed", "deleted"],
      default: "active",
    },

  },
  { timestamps: true, discriminatorKey: "promotionType" }
);

module.exports = mongoose.model("Promotion", basePromotionsSchema);
