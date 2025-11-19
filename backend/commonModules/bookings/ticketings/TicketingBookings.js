const mongoose = require("mongoose");

const bookedTicketSchema = new mongoose.Schema(
    {
        ticketId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Ticketings",
            required: true,
        },
        snapshot: {
            type: mongoose.Schema.Types.Mixed,
            required: true,
        },

        timeSlot: { //if the ticket booked has a time slot
            type: String,
            default: null,
        },

        quantity: {
            type: Number,
            required: true,
            min: 1,
        },

        protectionUserDetails: [{
            firstName: { type: String, required: true },
            surName: { type: String, required: true },
            dob: { type: String, default: "" },
            pid: { type: String, default: "" },
        }],

    },
    { _id: false }
);

const ticketingBookingSchema = new mongoose.Schema(
    {
        organization: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organizations",
            required: true,
            index: true,
        },

        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        ticketings: {
            type: [bookedTicketSchema],
            required: true,
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
            paymentMethod: { type: String, enum: ["applePay", "card", ""], default: "" },
            paymentStatus: { type: String, enum: ["pending", "completed", "failed"], default: "pending" },
        },
    },
    { timestamps: true }
);

const TicketingBookings = mongoose.model("TicketingBookings", ticketingBookingSchema);

module.exports = { TicketingBookings };
