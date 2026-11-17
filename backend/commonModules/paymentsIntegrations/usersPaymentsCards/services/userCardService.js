const userCardRepository = require("../repositories/userCardRepository");
const { encryptSecret, decryptSecret } = require("../../billko/billkoAuth");

// Monri v1.4 §5.1: at most 5 saved cards per guest.
const MAX_SAVED_CARDS = 5;

/** Monri cc_type → our brand values. */
function normalizeBrand(ccType) {
  const v = String(ccType || "").toLowerCase();
  if (v.startsWith("visa")) return "visa";
  if (v === "master" || v === "mastercard") return "mastercard";
  if (v === "maestro") return "maestro";
  if (v === "amex" || v === "american-express") return "amex";
  if (v === "diners") return "diners";
  if (v === "discover") return "discover";
  if (v === "jcb") return "jcb";
  return "unknown";
}

// Consent text shown when a card is saved (§9.3 consent_text_version).
// Checkout: Monri's own "save card" box. Profile: the Pleis Add card page.
const CONSENT_TEXT_VERSION = {
  checkout: "monri-save-card-box",
  profile: "pleis-add-card-v1",
};

/**
 * Monri expiry → { month, year }. Accepts YYMM ("3012"), MM/YY ("12/30"),
 * YYYY-MM ("2030-12"). Unknown → nulls.
 */
function parseExpiry(raw) {
  const v = String(raw || "").trim();
  let month = null;
  let year = null;
  let m;
  if ((m = v.match(/^(\d{2})(\d{2})$/))) {
    year = 2000 + Number(m[1]);
    month = Number(m[2]);
  } else if ((m = v.match(/^(\d{1,2})\s*\/\s*(\d{2}|\d{4})$/))) {
    month = Number(m[1]);
    year = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
  } else if ((m = v.match(/^(\d{4})-(\d{1,2})$/))) {
    year = Number(m[1]);
    month = Number(m[2]);
  }
  if (!(month >= 1 && month <= 12) || !(year >= 2000)) return { month: null, year: null };
  return { month, year };
}

/**
 * Store a card Monri tokenized: on an approved payment where the guest
 * ticked Monri's save box, or from Profile > Add card. Same card again →
 * refresh its token. Never more than MAX_SAVED_CARDS. Returns the card
 * (without token) or null.
 */
const saveCardFromMonriPayment = async ({
  userId,
  panToken,
  maskedPan,
  ccType,
  orderNumber,
  expirationDate = null,
  createdVia = "checkout",
}) => {
  if (!userId || !panToken || !maskedPan) return null;
  const brand = normalizeBrand(ccType);
  const last4 = String(maskedPan).replace(/\D/g, "").slice(-4) || null;
  const panTokenEncrypted = encryptSecret(panToken);
  const expiry = parseExpiry(expirationDate);
  const consentTextVersion = CONSENT_TEXT_VERSION[createdVia] || null;

  const same = await userCardRepository.findSameCard(userId, { brand, maskedPan });
  if (same) {
    same.panTokenEncrypted = panTokenEncrypted;
    same.expired = false;
    same.consentAt = new Date();
    same.consentTextVersion = consentTextVersion;
    same.lastUsedAt = new Date();
    if (expiry.month) {
      same.expiryMonth = expiry.month;
      same.expiryYear = expiry.year;
    }
    await same.save();
    return same.toJSON();
  }

  if ((await userCardRepository.countUserCards(userId)) >= MAX_SAVED_CARDS) {
    console.warn(`[saved-card] user ${userId} already has ${MAX_SAVED_CARDS} cards; not saving`);
    return null;
  }

  const card = await userCardRepository.createCard({
    user: userId,
    panTokenEncrypted,
    maskedPan,
    last4,
    brand,
    source: "monri",
    expiryMonth: expiry.month,
    expiryYear: expiry.year,
    createdVia,
    consentAt: new Date(),
    consentTextVersion,
    savedFromOrderNumber: orderNumber || null,
    lastUsedAt: new Date(),
  });
  return card.toJSON();
};

/** The decrypted Monri token of the owner's card, for the payment form only. */
const getCardTokenForPayment = async ({ cardId, userId }) => {
  const card = await userCardRepository.getCardWithToken(cardId, userId);
  if (!card?.panTokenEncrypted) return null;
  return { cardId: card._id, panToken: decryptSecret(card.panTokenEncrypted) };
};

const getUserCardsService = async (userId) => {
  return userCardRepository.getUserCards(userId);
};

const canSaveMoreCards = async (userId) =>
  (await userCardRepository.countUserCards(userId)) < MAX_SAVED_CARDS;

const deleteUserCardService = async ({ cardId, userId }) => {
  return userCardRepository.deleteCard(cardId, userId);
};

const setDefaultCardService = async ({ cardId, userId }) => {
  return userCardRepository.setDefaultCard(cardId, userId);
};

module.exports = {
  MAX_SAVED_CARDS,
  normalizeBrand,
  parseExpiry,
  saveCardFromMonriPayment,
  getCardTokenForPayment,
  getUserCardsService,
  canSaveMoreCards,
  deleteUserCardService,
  setDefaultCardService,
};
