const mongoose = require('mongoose');

const adminSettingsSchema = new mongoose.Schema({
  terms_and_conditions: {
    type: String,
    trim: true,
  },
  customer_terms_and_conditions: {
    type: String,
    trim: true,
  },
  about_us: {
    type: String,
    trim: true,
  },
  privacy_policy: {
    type: String,
    trim: true,
  },
  sales_terms: {
    type: String,
    trim: true,
  },
  // Requirement Set #108 / P5: 18+ order notice behaviour, switchable without a new app build.
  //   notice        the 18+ text above the pay / place-order button; nothing to tick or log
  //   confirmation  the same text plus a box the guest must tick before ordering / paying
  // Default TO BE SUPPLIED (Martin's opinion) — 'notice' as in app-menu-order prototype v2.7.
  age_notice_mode: {
    type: String,
    enum: ["notice", "confirmation"],
    default: "notice",
  },
  // Requirement Set #144: title of the guest ordering screen — the venue's offer consumed in
  // place, Pleis as intermediary. A setting so Legal can change the words without a delivery.
  ordering_screen_title: {
    type: String,
    trim: true,
    maxlength: 40,
    default: "In place Offer",
  }
}, {
  timestamps: true,
});

const AdminSettings = mongoose.model('AdminSettings', adminSettingsSchema);

module.exports = AdminSettings;
