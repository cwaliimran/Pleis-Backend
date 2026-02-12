const mongoose = require("mongoose");
const { GlobalRecurringPromotionSchema } = require("./RecurringPromotionSchema");

const globalBasePromotionSchema = new mongoose.Schema(
  {
    image: { type: String, default: "" },
    title: { type: String, trim: true, required: true },
    description: { type: String, default: "" },

    promotionType: {
      type: String,
      required: true,
      enum: ["globalHappyHourPromotion", "globalClaimPromotion"],
    },

    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    claimLimit: { type: Number, default: null },
    recurringDetails: {
      type: GlobalRecurringPromotionSchema,
      default: null,
    },
    recurringMeta: {
      isTemplate: {
        type: Boolean,
        default: false,
      },

      parentPromotion: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "GlobalBasePromotion",
        default: null,
      },

      occurrenceIndex: {
        type: Number,
        default: 1,
      }
    },

    tierLimit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GlobalStatusLevels",
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
    discriminatorKey: "promotionType",
  }
);

module.exports =
  mongoose.models.GlobalBasePromotion ||
  mongoose.model("GlobalBasePromotion", globalBasePromotionSchema);
