const {
  sendResponse,
  getReadableErrorMessage,
} = require("@utils/responseUtil");

const userWalletService = require("./userWalletService");


const getUserWallet = async (req, res) => {
  try {
    let { _id: user } = req.user;
    const wallet = await userWalletService.getUserWallet(user);
    return sendResponse({ res, statusCode: 200, translationKey: "user_wallet_fetched", data: wallet });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: readableError.statusCode, translationKey: readableError.message, error });
  }
};


module.exports = {
  getUserWallet,
};
