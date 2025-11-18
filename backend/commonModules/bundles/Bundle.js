const mongoose = require("mongoose");

const bundleSchema = new mongoose.Schema(
    {
        organization: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organizations",
            required: true,
            index: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            trim: true,
            default: "",
        },
        originalPrice: {
            type: Number,
            required: true,
            default: 0,
        },
        discountedPrice: {
            type: Number,
            required: true,
            default: 0,
        },
        discountPercentage: {
            type: Number,
            required: true,
            default: 0,
        },
        startDate: {
            type: Date,
            required: true,
        },
        endDate: {
            type: Date,
            required: true,
        },
        event: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Events",
            default: null,
        },
        bundleDetails: {
            ticketings: {
                type: [
                    {
                        ticketType: {
                            type: mongoose.Schema.Types.ObjectId,
                            ref: "Ticketings",
                            required: true,
                        },
                        quantity: {
                            type: Number,
                            required: true,
                            default: 1,
                        },
                    },
                ],
                default: [],
                _id: false,
            },
            //TODO reservations code merge and test
            reservations: {
                type: [
                    {
                        reservationType: {
                            type: mongoose.Schema.Types.ObjectId,
                            ref: "Reservations",
                            required: true,
                        },
                        quantity: {
                            type: Number,
                            required: true,
                            default: 1,
                        },
                    },
                ],
                default: [],
                _id: false,
            },
            preOrderItems: {
                type: [
                    {
                        menuItem: {
                            type: mongoose.Schema.Types.ObjectId,
                            ref: "MenuItems",
                            required: true,
                        },
                        quantity: {
                            type: Number,
                            required: true,
                            default: 1,
                        },
                    },
                ],
                default: [],
                _id: false,
            },
        },
        status: {
            type: String,
            enum: ["active", "inactive", "deleted"],
            default: "active",
        },
    },
    { timestamps: true }
);

const Bundle = mongoose.model("Bundle", bundleSchema);
module.exports = { Bundle };
