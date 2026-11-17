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

/**
 * Store the card Monri tokenized on an approved payment (the guest ticked
 * Monri's save box). Same card again → refresh its token. Never more than
 * MAX_SAVED_CARDS. Returns the card (without token) or null.
 */
const saveCardFromMonriPayment = async ({ userId, panToken, maskedPan, ccType, orderNumber }) => {
  if (!userId || !panToken || !maskedPan) return null;
  const brand = normalizeBrand(ccType);
  const last4 = String(maskedPan).replace(/\D/g, "").slice(-4) || null;
  const panTokenEncrypted = encryptSecret(panToken);

  const same = await userCardRepository.findSameCard(userId, { brand, maskedPan });
  if (same) {
    same.panTokenEncrypted = panTokenEncrypted;
    same.expired = false;
    same.consentAt = new Date();
    same.lastUsedAt = new Date();
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
    consentAt: new Date(),
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
  saveCardFromMonriPayment,
  getCardTokenForPayment,
  getUserCardsService,
  canSaveMoreCards,
  deleteUserCardService,
  setDefaultCardService,
};
