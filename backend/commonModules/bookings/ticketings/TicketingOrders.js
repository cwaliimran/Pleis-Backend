const mongoose = require("mongoose");

const ticketingOrderSchema = new mongoose.Schema(
    {

        user: { //person who made the booking
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        organization: { //organization hosting the event
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organizations",
            required: true,
            index: true,
        },
        event: { // event for which the booking is made
            type: mongoose.Schema.Types.ObjectId,
            ref: "Event",
            required: true,
            index: true,
        },
        status: {
            type: String,
            enum: ["pending", "confirmed", "cancelled", "completed"],
            default: "pending",
        },

        orderPricing: {
            subtotal: { type: Number, default: 0 },
            taxAmount: { type: Number, default: 0 },
            total: { type: Number, default: 0 },
            currency: { type: String, default: "€" },
        },

        paymentDetails: {
            cardId: { type: String, default: null },
            paymentId: { type: String, default: null },
            paymentMethod: {
                type: String,
                enum: ["applePay", "card", ""],
                default: "",
            },
            paymentStatus: {
                type: String,
                enum: ["pending", "completed", "failed"],
                default: "pending",
            },
        }
    },
    { timestamps: true }
);


const TicketingOrders = mongoose.model("TicketingOrder", ticketingOrderSchema);

module.exports = { TicketingOrders };