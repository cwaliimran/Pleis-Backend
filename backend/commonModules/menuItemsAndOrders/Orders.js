const mongoose = require("mongoose");
const { customAlphabet } = require("nanoid");
const generateOrderId = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);

const OrderItemSchema = new mongoose.Schema({
    menuItem: { type: mongoose.Schema.Types.ObjectId, ref: "MenuItems" },
    quantity: { type: Number, required: true },
    finalPrice: { type: Number, required: true }, // total for that item (with quantity)
    menuItemSnapShot: { type: Object, required: true }, // Full JSON snapshot of the menuItem
});

const OrdersSchema = new mongoose.Schema(
    {
        orderNumber: {
            type: String,
            unique: true,
            index: true,
            default: () => `ORD-${generateOrderId()}`,
        },
        organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organizations", required: true },
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        items: [OrderItemSchema],
        totalPrice: { type: Number, required: true },
        status: {
            type: String,
            enum: ["pending", "confirmed", "completed", "cancelled"],
            default: "pending",
        },
        notes: { type: String, default: "" },

        paymentMethod: {
            type: String, required: true,
            enum: ["applePay", "card", "cash", "payLater"], default: "card"
        },
        //with payLater user can add more items to cart
        // for applePay/card order can't be cancelled

        pickupType: { type: String, enum: ["counter", "tableService", "togo"], default: "counter" },
        tableNumber: {
            type: String,
            required: function () { return this.pickupType === "tableService"; },
        },
    },
    { timestamps: true }
);

// Ensure tableNumber is only set for tableService orders
OrdersSchema.pre("save", function (next) {
    if (this.pickupType !== "tableService") {
        this.tableNumber = undefined;
    }
    next();
});

module.exports = mongoose.model("MenuOrders", OrdersSchema);

