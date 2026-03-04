const userCardRepository = require("../repositories/userCardRepository");

const saveUserCardService = async ({
  userId,
  panToken,
  maskedPan,
  brand
}) => {

  const card = await userCardRepository.createCard({
    user: userId,
    panToken,
    maskedPan,
    brand
  });

  return card;
};


const getUserCardsService = async (userId) => {
  return userCardRepository.getUserCards(userId);
};


const deleteUserCardService = async ({ cardId, userId }) => {
  return userCardRepository.deleteCard(cardId, userId);
};


const setDefaultCardService = async ({ cardId, userId }) => {
  return userCardRepository.setDefaultCard(cardId, userId);
};

module.exports = {
  saveUserCardService,
  getUserCardsService,
  deleteUserCardService,
  setDefaultCardService
};