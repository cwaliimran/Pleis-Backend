const mongoose = require("mongoose");
const { nanoid } = require("nanoid");

const userBillinginformationSchema = new mongoose.Schema(
    {
        // --------------------------------------------
        // WHO THE TRANSACTION BELONGS TO
        // --------------------------------------------
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
        },
        firstName: {
            type: String,
            required: true,
            trim: true,
        },
        lastName: {
            type: String,
            required: true,
            trim: true,
        },

        // --------------------------------------------
        // BILLING ADDRESS
        // --------------------------------------------
        billingAddress: {
            address: {
                type: String,
                required: true, // Ensures that address is required
            },
            city: {
                type: String,
                required: true, // Ensures that city is required
            },
            postalCode: {
                type: String,
                required: true, // Ensures that postalCode is required
            },
            country: {
                type: String,
                required: true, // Ensures that country is required
            },
        },
        status: {
            type: String,
            enum: ["active", "inactive", "deleted"],
            default: "active",
        },

    },
    { timestamps: true } // Automatically add createdAt and updatedAt fields
);

const UserBillingInformation = mongoose.model(
    "UserBillingInformation",
    userBillinginformationSchema
);

module.exports = { UserBillingInformation };
