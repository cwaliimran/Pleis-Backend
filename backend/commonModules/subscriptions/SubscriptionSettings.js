const mongoose = require("mongoose");

// ---------------------------------------------------------
// MODULE PRICING
// ---------------------------------------------------------
const modulePricingSchema = new mongoose.Schema({
  module: { type: String, required: true },  // ordering | loyalty | reservations | analytics
  price: { type: Number, required: true },   // monthly price
});

// ---------------------------------------------------------
// BUNDLE DISCOUNTS (2 or 3 modules selected)
// ---------------------------------------------------------
const bundleDiscountSchema = new mongoose.Schema({
  twoModules: { type: Number, default: 0 },     // discount % for 2 modules
  threeModules: { type: Number, default: 0 },   // discount % for 3 modules
});

// ---------------------------------------------------------
// MULTI-ORGANIZATION DISCOUNTS (fixed org count values)
// ---------------------------------------------------------
const multiOrgPricingSchema = new mongoose.Schema({
  oneOrg: { type: Number, default: 0 },
  twoOrgs: { type: Number, default: 0 },
  threeOrgs: { type: Number, default: 0 },
  fourOrgs: { type: Number, default: 0 },
  fiveOrgs: { type: Number, default: 0 },
  sixPlusOrgs: { type: Number, default: 0 },

});

// ---------------------------------------------------------
// YEARLY BILLING DISCOUNT
// ---------------------------------------------------------
const yearlyDiscountSchema = new mongoose.Schema({
  discountPercent: { type: Number, default: 0 },   // Example: 15%
});
const commissionSchema = new mongoose.Schema({
  orderingCommission:   { type: Number, default: 0 },
  ticketingCommission:    { type: Number, default: 0 },
  reservationCommission:{ type: Number, default: 0 },
});
// ---------------------------------------------------------
// MAIN SUBSCRIPTION SETTINGS DOCUMENT
// ---------------------------------------------------------
const subscriptionSettingsSchema = new mongoose.Schema(
  {
    modulePricing: [modulePricingSchema],        // list of module pricing entries

    bundleDiscounts: bundleDiscountSchema,       // fixed bundle discount object

    multiOrgPricing: multiOrgPricingSchema,      // fixed multi-org pricing object

    yearlyDiscount: yearlyDiscountSchema,        // simple single value object
    commissions: commissionSchema,                // commission object
  },
  {
    timestamps: true,
  }
);

// Export Model
module.exports.SubscriptionSettings = mongoose.model(
  "SubscriptionSettings",
  subscriptionSettingsSchema
);
