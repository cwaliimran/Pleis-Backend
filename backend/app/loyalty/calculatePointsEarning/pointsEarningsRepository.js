const { getUserWallet } = require("../../userWalletService/global/walletManagement/userWalletService");
const { getCompanyLoyaltyInfo } = require("../clubMembers/clubMembersRepository");
const { getUserCompanyWallet } = require("../clubMembers/clubMembersService");

// calculatePointsRepo
const calculatePointsRepo = async (userId, companyOrganizer, totalSpending) => {
  totalSpending = Number(totalSpending || 0);

  const [globalWallet, userCompanyWallet] = await Promise.all([
    getUserWallet(userId),
    getUserCompanyWallet(userId, companyOrganizer),
  ]);

  // Global bonus (0–5)
  const globalBonus = globalWallet?.global?.level?.bonusPointsPerEuro || 0;

  // Organizer tier bonus (0–5)
  const tierBonus = userCompanyWallet?.level?.bonusPointsPerEuro || 0;

  // ORGANIZER POINTS
  const organizerPointsPerEuro = 10 + tierBonus;
  const organizerEarnedPoints = totalSpending * organizerPointsPerEuro;

  // GLOBAL POINTS
  const globalPointsPerEuro = 10 + globalBonus;
  const globalEarnedPoints = totalSpending * globalPointsPerEuro;

  // Cashback
  const cashbackPercent = (userCompanyWallet?.pointValuePercentage || 0) / 100;
  const cashback = totalSpending * cashbackPercent;

  return {
    global: {
      pointsPerEuro: globalPointsPerEuro,
      earnedPoints: globalEarnedPoints,
      cashback
    },
    organizer: {
      pointsPerEuro: organizerPointsPerEuro,
      earnedPoints: organizerEarnedPoints,
      cashback
    }
  };
};




module.exports = {
  calculatePointsRepo,
};
