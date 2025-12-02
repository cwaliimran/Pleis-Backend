const mongoose = require("mongoose");


const clubMembers = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        companyOrganizer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        tierKey: { type: String, default: "essential" },
        points: { type: Number, default: 0 }, // Current available points
        lifetimePoints: { type: Number, default: 0 }, // Total points ever earned
        level: { type: mongoose.Schema.Types.ObjectId, ref: "Tiers", default: null },
        lastEvaluated: { type: Date, default: Date.now },
       
        status: {
            type: String,
            enum: ["active", "inactive", "banned", "left"],
            default: "active",
        },
    },
    { timestamps: true }
);

//index to prevent duplicate club members
clubMembers.index({ user: 1, companyOrganizer: 1 }, { unique: true });


const ClubMembers = mongoose.model("ClubMembers", clubMembers);
module.exports = { ClubMembers };