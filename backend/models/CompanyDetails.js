const mongoose = require("mongoose");

const CompanySchema = new mongoose.Schema(
  {
    logo: {
      type: String,
      trim: true,
    },
    coverImage: {
      type: String,
      trim: true,
    },
    name: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Categories",
      default: null,
    },
    oib: {
      type: String,
      trim: true,
    },
    bankAccountNumber: {
      type: String,
      trim: true,
    },
    representativeName: {
      type: String,
      trim: true,
    },

    location: {
      fullAddress: {
        type: String, // Full formatted address, e.g., "13th Street 47, NY 10011, USA"
        default: "",
      },
      country: {
        type: String, // Country name
        default: "",
      },
      city: {
        type: String, // City name
        default: "",
      },
      postalCode: {
        type: String, // Postal code
        default: "",
      },
      state: {
        type: String,
        default: "",
      },
    },

    suppliers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Suppliers",
      },
    ],
    default: [],

    loyaltySettings: {
      title: {
        type: String,
        default: "",
      },
      model: {
        type: String,
        enum: ["essential", "preferred", "premier"],
        default: "essential",
      },

      pointValuePercentage: {
        type: Number,
        default: 0,
      },

      linkedClubs: [
        {
          club: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
          //club points and collaboration add here
        },
      ],
    },

    inAppOrderingSettings: {
      // Payment Methods
      paymentMethods: {
        instantPayment: {
          type: Boolean,
          default: false,
          // Customers pay immediately when placing their order.
        },
        payLater: {
          allow: {
            type: Boolean,
            default: false,
            // Allow customers to order now and pay after the order is prepared or delivered.
          },
          enableOrderAcceptance: {
            type: Boolean,
            default: false,
            // Staff must accept orders before preparation begins.
          },
          chargeOnAcceptance: {
            type: Boolean,
            default: false,
            // Payment is captured when staff accepts the order and begins preparation.
          },
          chargeOnDelivery: {
            type: Boolean,
            default: false,
            // Payment is captured after the order is fully completed and delivered.
          },
        },
        cashPayment: {
          type: Boolean,
          default: false,
          // Allow customers to pay with cash upon pickup or delivery.
        },
      },

      // Delivery Methods
      deliveryMethods: {
        counterPickup: {
          type: Boolean,
          default: true,
          // Customers collect items at the counter.
        },
        tableDelivery: {
          type: Boolean,
          default: false,
          // Staff delivers orders directly to the table.
        },
        toGo: {
          type: Boolean,
          default: false,
          // Orders are packaged for takeaway.
        },
      },
    },
  },
  {
    _id: false,
  }
);

module.exports = { CompanySchema };
