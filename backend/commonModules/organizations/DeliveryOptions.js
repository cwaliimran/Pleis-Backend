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
    // Delivery Methods
    deliveryMethod: {
      type: String,
      enum: ['counterPickup', 'tableDelivery', 'toGo'],
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
