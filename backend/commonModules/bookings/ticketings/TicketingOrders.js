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
        companyOrganizer: { // company organizer associated with the organization
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: false,
            index: true,
        },

        purpose: {
            type: String,
            enum: ["eventTicketPurchase", "reservation"],
            default: "eventTicketPurchase",
            required: true,
        },

        event: { // event for which the booking is made
            type: mongoose.Schema.Types.ObjectId,
            ref: "Event",
            default: null,
            required: function () {
                return this.purpose === "eventTicketPurchase";
            }
        },
        reservation: { // reservation for which the booking is made
            type: mongoose.Schema.Types.ObjectId,
            ref: "Reservations",
            default: null,
            required: function () {
                return this.purpose === "reservation";
            }
        },

        orderPricing: {
            subtotal: { type: Number, default: 0 },
            taxAmount: { type: Number, default: 0 },
            total: { type: Number, default: 0 },
            currency: { type: String, default: "€" },
        },

        ticketsPurchased: { type: Number, default: 0 },

        paymentDetails: {
            cardId: { type: String, default: null },
            paymentId: { type: String, default: null }, // gateway ref
            paymentMethod: {
                type: String,
                enum: ["applePay", "card", "cash"],
                default: null,
            },
            paymentStatus: {
                type: String,
                enum: ["pending", "paid", "failed", "refunded"],
                default: "pending",
                index: true,
            },
        },

        lockUntil: {
            type: Date,
            index: true,
        },

        status: {
            type: String,
            enum: [
                "pendingPayment",
                "paid",
                "cancelled",
                "completed",
            ],
            default: "pendingPayment",
            index: true,
        },
        //mixed type meta
        meta: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },

    },
    { timestamps: true }
);


const TicketingOrders = mongoose.model("TicketingOrder", ticketingOrderSchema);

module.exports = { TicketingOrders };