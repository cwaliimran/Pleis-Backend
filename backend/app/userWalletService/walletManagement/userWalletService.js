// backend/app/userWalletService/walletManagement/userWalletService.js
const { formatUserWallet } = require("./formatters/usersWalletFormatter");
const userWalletRepo = require("./userWalletRepository");

const createUserWallet = async (user) => {
    const doc = await userWalletRepo.createUserWallet(user);
    return doc;
};

const getUserWallet = async (user) => {
    const doc = await userWalletRepo.getUserWallet(user);
    return formatUserWallet(doc);
};

module.exports = {
    createUserWallet,
    getUserWallet
};