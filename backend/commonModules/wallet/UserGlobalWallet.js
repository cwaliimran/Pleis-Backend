const mongoose = require("mongoose");

const userGlobalWalletSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        global: {
            points: { type: Number, default: 0 }, // Current available points
            lifetimePoints: { type: Number, default: 0 }, // Total points ever earned
            level: { type: mongoose.Schema.Types.ObjectId, ref: "GlobalStatusLevels", default: null },
            lastEvaluated: { type: Date, default: Date.now },
        }

    },
    {
        timestamps: true,
    }
);

const UserGlobalWallet = mongoose.model("UserGlobalWallet", userGlobalWalletSchema);

module.exports = { UserGlobalWallet };