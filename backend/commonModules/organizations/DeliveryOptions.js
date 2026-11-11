const mongoose = require("mongoose");
const { nanoid } = require("nanoid");


const deliveryOptionsSchema = new mongoose.Schema(
  {
    publicId: {
      type: String,
      unique: true,
      index: true,
      default: () => nanoid(),
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organizations",
      required: true,
    },

    title: {
      type: String,
      required: true,
    },
    // Delivery destination. Requirement Set #146: IN-PLACE only (table, counter/bar).
    // "To go" is a menu item attribute, never a destination of an order.
    // null = migrated from the former "to go" destination; the operator must choose one.
    deliveryMethod: {
      type: String,
      enum: ['counterPickup', 'tableDelivery', null],
      default: 'counterPickup',
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'deleted'],
      default: 'active',
    },
  },
  {
    timestamps: true,
  }
);

const DeliveryOptions = mongoose.model("DeliveryOptions", deliveryOptionsSchema);

module.exports = DeliveryOptions;
