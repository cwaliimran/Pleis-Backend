const { default: mongoose } = require("mongoose");
const UserCard = require("./UserCard.model");

const toId = (id) => new mongoose.Types.ObjectId(String(id));

// Only Monri-tokenized cards can be paid with; legacy client-side rows are hidden.
const usableFilter = (userId) => ({
  user: toId(userId),
  source: "monri",
  expired: { $ne: true },
});

const createCard = async (data) => {
  return UserCard.create(data);
};

/** Cards shown to the guest: brand + masked number only, never the token. */
const getUserCards = async (userId) => {
  return UserCard.find(usableFilter(userId))
    .select("-panToken -panTokenEncrypted")
    .sort({ isDefault: -1, lastUsedAt: -1, createdAt: -1 })
    .lean();
};

const countUserCards = async (userId) => UserCard.countDocuments(usableFilter(userId));

const getCardById = async (cardId, userId) => {
  return UserCard.findOne({ _id: toId(cardId), user: toId(userId) });
};

/** Owner's usable card with its encrypted token (server use only). */
const getCardWithToken = async (cardId, userId) => {
  return UserCard.findOne({ _id: toId(cardId), ...usableFilter(userId) })
    .select("+panTokenEncrypted")
    .lean();
};

/** Same card saved twice: matched on brand + masked number (§5.1). */
const findSameCard = async (userId, { brand, maskedPan }) => {
  return UserCard.findOne({ user: toId(userId), source: "monri", brand, maskedPan });
};

const deleteCard = async (cardId, userId) => {
  return UserCard.deleteOne({ _id: toId(cardId), user: toId(userId) });
};

const setDefaultCard = async (cardId, userId) => {
  await UserCard.updateMany(
    { user: toId(userId) },
    { $set: { isDefault: false } }
  );

  return UserCard.findOneAndUpdate(
    { _id: toId(cardId), user: toId(userId) },
    { $set: { isDefault: true } },
    { new: true }
  ).select("-panToken -panTokenEncrypted");
};

const touchCard = async (cardId) => {
  return UserCard.updateOne({ _id: toId(cardId) }, { $set: { lastUsedAt: new Date() } });
};

const markCardExpired = async (cardId) => {
  return UserCard.updateOne({ _id: toId(cardId) }, { $set: { expired: true } });
};

module.exports = {
  markCardExpired,
  createCard,
  getUserCards,
  countUserCards,
  getCardById,
  getCardWithToken,
  findSameCard,
  deleteCard,
  setDefaultCard,
  touchCard,
};
