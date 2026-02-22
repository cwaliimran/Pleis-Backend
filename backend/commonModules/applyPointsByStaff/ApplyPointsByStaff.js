const mongoose = require("mongoose");
const { customAlphabet } = require("nanoid");
const generateOrderId = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);

const OrderItemSchema = new mongoose.Schema({
    menuItem: { type: mongoose.Schema.Types.ObjectId, ref: "MenuItems" },
    quantity: { type: Number, required: true },
    isdelivered: { type: Boolean, default: false },
    finalPrice: { type: Number, required: true }, // total for that item (with quantity)
    menuItemSnapShot: { type: Object, required: true }, // Full JSON snapshot of the menuItem
});

const ApplyPointsByStaffSchema = new mongoose.Schema(
    {
        orderNumber: {
            type: String,
            index: true,
            default: () => `ORD-${generateOrderId()}`,
        },
        organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organizations", required: true },
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        items: [OrderItemSchema],
        totalPrice: { type: Number, required: true },
        notes: { type: String, default: "" },
        creator: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    },
    { timestamps: true }
);

module.exports = mongoose.model("ApplyPointsByStaff", ApplyPointsByStaffSchema);

