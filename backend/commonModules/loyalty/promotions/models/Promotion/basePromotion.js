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
      enum: [
        "happyHour",
        "buyMenuItemPromotion",
        "productSale",
        "extraPointsForItem",
      ],
    },

    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    claimLimit: { type: Number, default: null },
    recurringDetails: {
      type: RecurringPromotionSchema,
      default: null,
    },
    recurringMeta: {
      isTemplate: {
        type: Boolean,
        default: false,
      },

      parentPromotion: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Promotion",
        default: null,
      },

      occurrenceIndex: {
        type: Number,
        default: 1,
      },
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
    startTime: { type: String, default: null },
    endTime: { type: String, default: null },
    activeDays: {
      type: {
        mode: {
          type: String,
          enum: ["all", "selective"],
          default: "all",
        },
        days: {
          type: [String],
          enum: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
          default: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
        },
      },
      default: () => ({
        mode: "all",
        days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      }),
    },
  },
  { timestamps: true, discriminatorKey: "promotionType" },
);

basePromotionsSchema.index({
  companyOrganizer: 1,
  "recurringMeta.parentPromotion": 1,
  // startDate: 1,
});

module.exports = mongoose.model("Promotion", basePromotionsSchema);
