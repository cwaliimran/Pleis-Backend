
const { getUserWallet } = require("../../userWalletService/global/walletManagement/userWalletService");
const { getTransactions } = require("../../userWalletService/transactions/services/unifiedTransactionsService");
const { getGlobalLoyaltyChallenges } = require("../challenges/challengesService");
const { getCategories } = require("../globalRewardCategories/globalRewardCategoriesService");



const getDashboard = async ({ timezone, userId }) => {

  let [userGlobalWallet, categoriesData, globalChallenges, globalTransactions] = await Promise.all([
    getUserWallet(userId),
    getCategories({ page: 1, limit: 10 }),
    getGlobalLoyaltyChallenges({ userId, timezone, page: 1, limit: 10, skip: 0 }),
    getTransactions({ page: 1, limit: 10, user: userId, walletType: "globalWallet" }),
  ]);

  return {
    dashboard: {
      userGlobalWallet: userGlobalWallet?.global ?? userGlobalWallet ?? null,
      categories: categoriesData.categories || [],
      globalChallenges,
      globalTransactions,
    }
  };
};




module.exports = {
  getDashboard,
};
