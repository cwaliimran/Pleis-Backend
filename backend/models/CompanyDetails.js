const mongoose = require("mongoose");

const CompanySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
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
            ref: "LoyaltyClubs",
          },
          //club points and collaboration add here
        },
      ],
    },
  },

  {
    _id: false,
  }
);

module.exports = { CompanySchema };
