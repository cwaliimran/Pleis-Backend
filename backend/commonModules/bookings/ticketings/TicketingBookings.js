const mongoose = require("mongoose");


const ticketingBookingSchema = new mongoose.Schema(
    {
        order: { //reference to the order
            type: mongoose.Schema.Types.ObjectId,
            ref: "TicketingOrder",
            required: true,
            index: true,
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        organization: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organizations",
            required: true,
            index: true,
        },
        ticket: {
            ticketId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Ticketings",
                required: true,
            },

            snapshot: {
                type: mongoose.Schema.Types.Mixed,
                required: true,
            },

            timeSlot: {
                type: String,
                default: null,
            },

            protectionUserDetails: {
                firstName: { type: String, required: true },
                surName: { type: String, required: true },
                dob: { type: String, required: false, default: "" },
                pid: { type: String, required: false, default: "" },
            },
        },

        status: {
            type: String,
            enum: ["valid", "cancelled", "used"],
            default: "valid",
        },
    },
    { timestamps: true }
);


const TicketingBookings = mongoose.model("TicketingBookings", ticketingBookingSchema);

module.exports = { TicketingBookings };
