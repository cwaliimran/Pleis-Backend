const mongoose = require("mongoose");

/**
 * Guest saved card (Monri v1.4 §5.1, §9.3 saved_payment_method).
 *
 * A card is saved only from a Monri-approved payment where the guest ticked
 * Monri's own "save card" box (tokenize_pan_offered). Pleis keeps the Monri
 * pan_token (encrypted at rest), brand and masked number — never the card
 * number or CVV. The token is never returned to any client.
 */
const userCardSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    // Monri pan_token, AES-256-GCM encrypted (see userCardService).
    panTokenEncrypted: {
      type: String,
      select: false,
    },

    // Legacy plaintext field from the old client-side save (never a real Monri
    // token). Kept only so old rows load; such cards can't be paid with.
    panToken: {
      type: String,
      select: false,
    },

    // e.g. 434179-xxx-xxx-0044 as Monri returns it
    maskedPan: {
      type: String,
      required: true
    },

    last4: { type: String, default: null },

    brand: {
      type: String,
      enum: ["visa", "mastercard", "maestro", "amex", "diners", "discover", "jcb", "unknown"],
      default: "unknown"
    },

    source: {
      type: String,
      enum: ["monri", "legacy"],
      default: "legacy",
    },

    // When the guest ticked Monri's save box on an approved payment.
    consentAt: { type: Date, default: null },
    savedFromOrderNumber: { type: String, default: null },

    // Monri reported the token invalid (§5.1 edge case): not offered again.
    expired: { type: Boolean, default: false },

    isDefault: {
      type: Boolean,
      default: false
    },

    lastUsedAt: {
      type: Date
    }
  },
  { timestamps: true }
);

userCardSchema.index({ user: 1, createdAt: -1 });

// Never send token fields to a client, even if a query selected them.
userCardSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.panToken;
    delete ret.panTokenEncrypted;
    return ret;
  },
});

module.exports = mongoose.model("UserCard", userCardSchema);
