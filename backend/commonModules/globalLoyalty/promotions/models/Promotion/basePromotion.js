const mongoose = require("mongoose");
const { GlobalRecurringPromotionSchema } = require("./RecurringPromotionSchema");


const globalBasePromotionSchema = new mongoose.Schema(
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

    companyOrganizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    status: {
      type: String,
      enum: ["active", "inactive", "completed", "deleted"],
      default: "active",
    },
  },
  { timestamps: true, discriminatorKey: "globalPromotionType" }
);

// Export as a Global Model
module.exports = mongoose.model("GlobalBasePromotion", globalBasePromotionSchema);
