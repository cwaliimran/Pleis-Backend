const mongoose = require("mongoose");

const PromotionOrderSchema = new mongoose.Schema(
  {
    // user claiming promotion
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // promotion source
    promotion: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Promotion",
      required: true,
    },

    // organizer club/company
    companyOrganizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    /* =============================
       CLAIM DETAILS
    ============================== */

    promotionType: {
      type: String,
      enum: [
        "happyHour",
        "claimPromotion",
        "buyMenuItemPromotion",
        "productSale",
      ],
      required: true,
    },

    // points spent if claimPromotion
    pointsSpent: {
      type: Number,
      default: 0,
    },

    // snapshot of tier at claim time
    tierSnapshot: {
      title: String,
      entryPoints: Number,
    },

    /* =============================
       ORDER STATUS
    ============================== */
    status: {
      type: String,
      enum: [
        "claimed",
        "redeemed",
        "expired",
        "cancelled",
      ],
      default: "claimed",
    },

    /* =============================
       OPTIONAL FUTURE FIELDS
    ============================== */

    redeemedAt: {
      type: Date,
      default: null,
    },

    expiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

/* =============================
   INDEXES
============================= */

// Fast claim counting per promotion
PromotionOrderSchema.index({
  promotion: 1,
});

PromotionOrderSchema.index(
  { user: 1, promotion: 1, status: 1 }
);

module.exports =
  mongoose.models.PromotionOrder ||
  mongoose.model("PromotionOrder", PromotionOrderSchema);
