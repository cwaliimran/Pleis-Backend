const mongoose = require("mongoose");
const { customAlphabet } = require("nanoid");
const generateOrderId = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 6);

const OrderItemSchema = new mongoose.Schema({
  menuItem: { type: mongoose.Schema.Types.ObjectId, ref: "MenuItems" },
  quantity: { type: Number, required: true },
  status: {
    type: String,
    enum: ["pending", "confirmed", "rejected"],
    default: "confirmed",
  },
  isdelivered: { type: Boolean, default: false },
  finalPrice: { type: Number, required: true }, // total for that item (with quantity)
  menuItemSnapShot: { type: Object, required: true }, // Full JSON snapshot of the menuItem
});

const OrderComboItemSchema = new mongoose.Schema({
  menuItem: { type: mongoose.Schema.Types.ObjectId, ref: "MenuItems" },
  menuItemSnapShot: { type: Object, required: true },
});

const OrderComboSchema = new mongoose.Schema({
  combo: { type: mongoose.Schema.Types.ObjectId, ref: "MenuItemsCombos" },
  quantity: { type: Number, required: true },
  items: [OrderComboItemSchema],
  unitPrice: { type: Number, required: true },
  unitFinalPrice: { type: Number, required: true },
  saleDiscountPerUnit: { type: Number, default: 0 },
  finalPrice: { type: Number, required: true },
  comboSnapShot: { type: Object, required: true },
});

const OrdersSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      index: true,
      default: () => `ORD-${generateOrderId()}`,
    },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organizations", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    items: [OrderItemSchema],
    combos: { type: [OrderComboSchema], default: [] },
    totalPrice: { type: Number, required: true },
    priceBreakdown: {
      type: Object,
      default: null,
      // Example structure:
      // {
      //   itemsTotal: 20,
      //   tax: 1.5,
      //   discount: 2,
      //   finalTotal: 19.5
      // }
    },
    status: {
      type: String,
      enum: ["pendingPayment", "pending", "confirmed", "sent", "completed", "cancelled", "rejected", "preorder"],
      default: "pending",
    },
    lockUntil: {
      type: Date,
      index: true,
    },

    notes: { type: String, default: "" },

    paymentMethod: {
      type: String,
      required: true,
      enum: ["applePay", "card", "cash"],
      default: "card",
    },
    //with payLater user can add more items to cart
    // for applePay/card order can't be cancelled
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },
    paidAt: {
      type: Date,
      default: null,
    },
    transactionId: {
      type: String,
      default: null,
      index: true,
    },
    orderType: {
      type: String,
      enum: [
        "online",
        "preorder", // Scheduled for later
        "walkIn", // In-store / counter
      ],
      default: "online",
    },
    reservation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserReservations",
      default: undefined,
    },
    deliveryOption: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeliveryOptions",
      required: true,
    },
    pickupType: { type: String },
    tableNumber: {
      type: String,
    },
    reasonForCancellation: {
      type: String,
      default: null,
    },
    reasonForRejection: {
      type: String,
      default: null,
    },
    noteForRejection: {
      type: String,
      default: null,
    },
    noteForCancellation: {
      type: String,
      default: null,
    },
    updateHistory: {
      type: [
        {
          updatedAt: { type: Date, default: Date.now },
          updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
          },
          updateData: { type: Object, default: {} },
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

// Ensure tableNumber is only set for tableService orders
OrdersSchema.pre("save", function (next) {
  if (this.pickupType !== "tableService") {
    this.tableNumber = undefined;
  }
  next();
});

module.exports = mongoose.model("MenuOrders", OrdersSchema);
