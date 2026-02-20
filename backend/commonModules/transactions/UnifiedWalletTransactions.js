const mongoose = require("mongoose");
const { nanoid } = require("nanoid");

const unifiedTransactionSchema = new mongoose.Schema(
    {
        // --------------------------------------------
        // WHO THE TRANSACTION BELONGS TO
        // --------------------------------------------
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        companyOrganizer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },

        organization: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organizations",
            default: null,
        },

        publicId: {
            type: String,
            unique: true,
            default: () => nanoid(),
        },

        batchId: {
            type: String,
            required: true      // Important: always included
        },

        // --------------------------------------------
        // WALLET TYPE (Company Loyalty vs Global Wallet)
        // --------------------------------------------
        walletType: {
            type: String,
            enum: ["companyLoyalty", "globalWallet"],
            required: true,
        },

        // --------------------------------------------
        // TRANSACTION TYPE (Direction)
        // --------------------------------------------
        type: {
            type: String,
            enum: ["earn", "redeem", "adjustment"],
            required: true,
        },

        // --------------------------------------------
        // DOMAIN / SOURCE OF POINTS
        // --------------------------------------------
        domainType: {
            type: String,
            enum: [
                "menuorders",
                "ticketingorders", //for ticket bookings
                "ticketingbookings", //for ticket transfers
                "loyaltyrewardsorders",
                "loyaltychallengesorders",
                "globalrewardsorders",
                "userreservations",
                "applypointsbystaffs",
                "promotionorders",
                "event",
                "menuItem",
                "challenge",
                "badge",
                "referral",
                "admin",
                "promotion",
                "system",
                "gift",
            ],
            required: true,
        },

        // --------------------------------------------
        // LINKED OBJECT (ticketId, orderId, eventId...)
        // --------------------------------------------
        entityId: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },

        // --------------------------------------------
        // POINTS STRUCTURE
        // --------------------------------------------
        points: {
            base: { type: Number, required: true },
            multiplier: { type: Number, default: 1 },
            total: { type: Number, required: true },
            bonusPoints: { type: Number, default: 0 },
            pointsPerEuro: { type: Number, default: 0 },
        },

        pointsBreakdown: {
            type: Object,
            default: {},
        },
        // --------------------------------------------
        // BALANCE AFTER TRANSACTION
        // --------------------------------------------
        closingBalance: {
            type: Number,
            required: true,
        },

        // --------------------------------------------
        // TEXT DESCRIPTION
        // --------------------------------------------
        description: {
            type: String,
            default: "",
        },

        createdAt: { type: Date, default: Date.now },
    },
    {
        timestamps: true,
    }
);
// 🔐 Unique identifiers
unifiedTransactionSchema.index({ batchId: 1 });

// 🔎 Main earning query (12-month earned query)
unifiedTransactionSchema.index({
  user: 1,
  walletType: 1,
  type: 1,
  createdAt: -1
});

// 📜 User transaction history
unifiedTransactionSchema.index({
  user: 1,
  createdAt: -1,
  _id: -1
});

// 🎯 Organization & filters
unifiedTransactionSchema.index({ organization: 1 });
unifiedTransactionSchema.index({ companyOrganizer: 1 });
unifiedTransactionSchema.index({ domainType: 1 });
unifiedTransactionSchema.index({ entityId: 1 });




const UnifiedWalletTransactions = mongoose.model(
    "UnifiedWalletTransactions",
    unifiedTransactionSchema
);


module.exports = { UnifiedWalletTransactions };
