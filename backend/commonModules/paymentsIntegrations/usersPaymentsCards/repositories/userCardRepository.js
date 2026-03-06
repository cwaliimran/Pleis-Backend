const { default: mongoose } = require("mongoose");
const UserCard = require("./UserCard.model");

const createCard = async (data) => {
  return UserCard.create(data);
};

const getUserCards = async (userId) => {
  return UserCard.find({ user: userId })
    .sort({ isDefault: -1, createdAt: -1 })
    .lean();
};

const getCardById = async (cardId, userId) => {
  return UserCard.findOne({ _id: new mongoose.Types.ObjectId(cardId), user: new mongoose.Types.ObjectId(userId) });
};

const deleteCard = async (cardId, userId) => {
  return UserCard.deleteOne({ _id: new mongoose.Types.ObjectId(cardId), user: new mongoose.Types.ObjectId(userId) });
};

const setDefaultCard = async (cardId, userId) => {
  await UserCard.updateMany(
    { user: new mongoose.Types.ObjectId(userId) },
    { $set: { isDefault: false } }
  );

  return UserCard.findOneAndUpdate(
    { _id: new mongoose.Types.ObjectId(cardId), user: new mongoose.Types.ObjectId(userId) },
    { $set: { isDefault: true } },
    { new: true }
  );
};

module.exports = {
  createCard,
  getUserCards,
  getCardById,
  deleteCard,
  setDefaultCard
};