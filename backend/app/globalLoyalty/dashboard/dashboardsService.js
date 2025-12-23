
const { getUserWallet } = require("../../userWalletService/global/walletManagement/userWalletService");
const { getRecentTransactionsForDashboard } = require("../../userWalletService/transactions/services/unifiedTransactionsService");
const { getGlobalLoyaltyChallenges } = require("../challenges/challengesService");
const { getCategories } = require("../globalRewardCategories/globalRewardCategoriesService");
const { getGlobalPromotionsService } = require("../promotions/promotionsService");
const { getGlobalRewardsService } = require("../rewards/rewardsService");



const getDashboard = async ({ timezone, userId }) => {

  let [userGlobalWallet, categoriesData, globalChallenges, globalRewards, globalPromotions, globalTransactions] = await Promise.all([
    getUserWallet(userId),
    getCategories({ page: 1, limit: 10 }),
    getGlobalLoyaltyChallenges({ userId, timezone, page: 1, limit: 10, skip: 0 }),
    getGlobalRewardsService({ userId }),
    getGlobalPromotionsService({ userId, page: 1, limit: 10, skip: 0, timezone }),
    getRecentTransactionsForDashboard({ limit: 4, user: userId, walletType: "globalWallet" }),
  ]);

  return {
    dashboard: {
      userGlobalWallet: userGlobalWallet?.global ?? userGlobalWallet ?? null,
      categories: categoriesData.categories || [],
      globalChallenges: globalChallenges.challenges || [],
      globalRewards: globalRewards.rewards || [],
      globalPromotions: globalPromotions.responses || [],
      globalTransactions,
    }
  };
};




module.exports = {
  getDashboard,
};
