const mongoose = require("mongoose");

const OrderItemSchema = new mongoose.Schema({
    menuItem: { type: mongoose.Schema.Types.ObjectId, ref: "MenuItems" },
    quantity: { type: Number, required: true },
    finalPrice: { type: Number, required: true }, // total for that item (with quantity)
    menuItemSnapShot: { type: Object, required: true }, // Full JSON snapshot of the menuItem
});

const OrdersSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "Users", required: true },
        items: [OrderItemSchema],
        totalPrice: { type: Number, required: true },
        status: {
            type: String,
            enum: ["pending", "confirmed", "completed", "cancelled"],
            default: "pending",
        },
        deliveryAddress: { type: String, required: true },
        paymentMethod: {
            type: String, required: true,
             enum: ["applePay", "card", "cash", "payLater"], default: "card"
        },
        pickupType: { type: String, enum: ["counter", "tableService"], default: "counter" },
        tableNumber: {
            type: String,
            required: function () { return this.pickupType === "tableService"; },
            select: false,
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

