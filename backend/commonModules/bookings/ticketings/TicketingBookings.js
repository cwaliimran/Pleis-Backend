const mongoose = require("mongoose");
const { customAlphabet } = require("nanoid");
const generateTicketId = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);


const ticketingBookingSchema = new mongoose.Schema(
    {
        ticketBookingId: {
            type: String,
            unique: true,
            index: true,
            default: () => `TBK-${generateTicketId()}`, //TBK for Ticketing Booking 
        },
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
        transferHistory: {
            type: [
                {
                    fromUser: {
                        type: mongoose.Schema.Types.ObjectId,
                        ref: "User",
                    },
                    toUser: {
                        type: mongoose.Schema.Types.ObjectId,
                        ref: "User",
                    },
                    transferDate: {
                        type: Date,
                        default: Date.now,
                    },
                },
            ],
            default: [],
        },
        organization: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organizations",
            required: true,
            index: true,
        },
        companyOrganizer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
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
                firstName: { type: String, default: "" },
                surName: { type: String, default: "" },
                dob: { type: String, default: "" },
                pid: { type: String, default: "" },
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
