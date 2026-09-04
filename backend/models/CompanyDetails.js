const mongoose = require("mongoose");
const { stripBillkoSecrets } = require("../commonModules/paymentsIntegrations/billko/billkoAuth");

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
    billkoApiKeyEncrypted: {
      type: String,
      default: "",
    },
    billkoKeyConfigured: {
      type: Boolean,
      default: false,
    },
    default: [],

    loyaltySettings: {
      isEnabled: {
        type: Boolean,
        default: false,
      },
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

    status: {
      type: String,
      enum: [
        "active",
        "suspended",
      ],
      default: "active",
    },
  },
  {
    _id: false,
  }
);

function stripSecrets(_doc, ret) {
  return stripBillkoSecrets(ret);
}

CompanySchema.set("toJSON", { transform: stripSecrets });
CompanySchema.set("toObject", { transform: stripSecrets });

module.exports = { CompanySchema };
