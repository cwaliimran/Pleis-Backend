const mongoose = require("mongoose");


const clubMembers = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Users",
            required: true,
            index: true,
        },
        companyOrganizer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Users",
            required: true,
            index: true,
        },
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