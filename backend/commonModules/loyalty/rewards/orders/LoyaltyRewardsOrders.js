const mongoose = require("mongoose");
const { customAlphabet } = require("nanoid");
const generateRewardId = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);

const rewardsOrderSchema = new mongoose.Schema(
    {
        bookingId: {
            type: String,
            unique: true,
            index: true,
            default: () => `RWD-${generateRewardId()}`, //RWD for Reward Order 
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        companyOrganizer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: false,
            index: true,
        },

        // reward being claimed
        reward: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Reward",
            required: true,
            index: true,
        },

        // snapshot used to lock reward values at time of claim
        snapshot: {
            type: mongoose.Schema.Types.Mixed,
            required: true,
        },

        // points handling for redemption
        pointsUsed: { type: Number, required: true, default: 0 },

        status: {
            type: String,
            enum: ["pending", "completed", "expired"], // pending - initial state when user has added to wallet, completed - reward claimed successfully, expired - reward claim expired without completion
            default: "pending",
        },
        redeemedAt: { type: Date, default: null },
        redeemedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
    },
    { timestamps: true }
);

const RewardsOrders = mongoose.model("LoyaltyRewardsOrders", rewardsOrderSchema);

module.exports = { RewardsOrders };
