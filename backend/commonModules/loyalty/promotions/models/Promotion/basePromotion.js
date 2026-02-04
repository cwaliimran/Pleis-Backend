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
      }
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
  { timestamps: true, discriminatorKey: "promotionType" }
);

basePromotionsSchema.index(
  {
    companyOrganizer: 1,
    "recurringMeta.parentPromotion": 1,
    // startDate: 1,
  },
  { unique: true, sparse: true }
);


module.exports = mongoose.model("Promotion", basePromotionsSchema);
