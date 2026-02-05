const mongoose = require("mongoose");

const GlobalPromotionsOrdersSchema =
  new mongoose.Schema(
    {
      /* =============================
         USER CLAIMING PROMOTION
      ============================== */
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },

      /* =============================
         GLOBAL PROMOTION SOURCE
      ============================== */
      promotion: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "GlobalBasePromotion",
        required: true,
        index: true,
      },

      /* =============================
         PROMOTION SNAPSHOT
      ============================== */
      promotionType: {
        type: String,
        required: true,
      },

      /* =============================
         POINTS SPENT (IF ANY)
      ============================== */
      pointsSpent: {
        type: Number,
        default: 0,
      },

      /* =============================
         USER TIER SNAPSHOT
      ============================== */
      tierSnapshot: {
        title: String,
        entryPoints: Number,
      },

      /* =============================
         CLAIM STATUS
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
        index: true,
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

// Fast per-promotion counting
GlobalPromotionsOrdersSchema.index({
  promotion: 1,
});

// Fast user claim lookup
GlobalPromotionsOrdersSchema.index({
  user: 1,
  promotion: 1,
  status: 1,
});

module.exports =
  mongoose.models.GlobalPromotionsOrders ||
  mongoose.model(
    "GlobalPromotionsOrders",
    GlobalPromotionsOrdersSchema
  );
