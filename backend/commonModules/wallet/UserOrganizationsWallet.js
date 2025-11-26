const mongoose = require("mongoose");

const userOrganizationsWalletSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        organization: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organizations",
            required: true,
        },

        points: { type: Number, default: 0 }, // Current available points
        lifetimePoints: { type: Number, default: 0 }, // Total points ever earned
        level: { type: mongoose.Schema.Types.ObjectId, ref: "GlobalStatusLevels", default: null },
        lastEvaluated: { type: Date, default: Date.now },
    },
    {
        timestamps: true,
    }
);

const UserOrganizationsWallet = mongoose.model("UserOrganizationsWallet", userOrganizationsWalletSchema);

module.exports = { UserOrganizationsWallet };