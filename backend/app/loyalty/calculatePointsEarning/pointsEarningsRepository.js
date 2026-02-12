const { getActiveGlobalLoyaltyHappyHourPromotion } = require("../../../admin/globalLoyalty/promotions/promotionsRepository");
const { getUserWallet } = require("../../userWalletService/global/walletManagement/userWalletService");
const { getUserCompanyWallet } = require("../clubMembers/clubMembersService");
const { getActiveLoyaltyHappyHourPromotion } = require("../promotions/promotionsRepository");

// calculatePointsRepo
const calculatePointsRepo = async (
  userId,
  companyOrganizer,
  totalSpending
) => {
  totalSpending = Number(totalSpending || 0);

  const [
    globalWallet,
    userCompanyWallet,
  ] = await Promise.all([
    getUserWallet(userId),
    getUserCompanyWallet(userId, companyOrganizer),
  ]);

  const [
    globalLoyaltyHappyHourPromotion,
    loyaltyHappyHourPromotion,
  ] = await Promise.all([
    getActiveGlobalLoyaltyHappyHourPromotion({
      userId,
      userTierEntryPoints: globalWallet.global?.level?.entryPoints,
    }),
    getActiveLoyaltyHappyHourPromotion({
      companyOrganizer,
      userId,
      userTierEntryPoints:
        userCompanyWallet?.level?.entryPoints,
    }),
  ]);


  /* =============================
     BONUS VALUES
  ============================== */

  const globalBonus =
    globalWallet?.global?.level?.bonusPointsPerEuro || 0;

  const tierBonus =
    userCompanyWallet?.level?.bonusPointsPerEuro || 0;

  /* =============================
     MULTIPLIERS
  ============================== */

  const organizerMultiplier =
    loyaltyHappyHourPromotion?.pointsMultiplier || 1;

  const globalMultiplier =
    globalLoyaltyHappyHourPromotion?.pointsMultiplier || 1;

  /* =============================
     ORGANIZER POINTS
  ============================== */

  const organizerPointsPerEuro =
    10 + tierBonus + globalBonus;

  const organizerEarnedPoints = Math.round(
    totalSpending *
    organizerPointsPerEuro *
    organizerMultiplier
  );

  /* =============================
     GLOBAL POINTS
  ============================== */

  const globalPointsPerEuro =
    10 + globalBonus + tierBonus;

  const globalEarnedPoints = Math.round(
    totalSpending *
    globalPointsPerEuro *
    globalMultiplier
  );

  /* =============================
     CASHBACK
  ============================== */

  const cashbackPercent =
    (userCompanyWallet?.pointValuePercentage || 0) / 100;

  const cashback = Math.round(
    totalSpending * cashbackPercent
  );

  return {
    organizerMultiplierApplied: organizerMultiplier,
    globalMultiplierApplied: globalMultiplier,

    global: {
      pointsPerEuro: globalPointsPerEuro,
      earnedPoints: globalEarnedPoints,
      cashback,
    },

    organizer: {
      pointsPerEuro: organizerPointsPerEuro,
      earnedPoints: organizerEarnedPoints,
      cashback,
    },
  };
};



module.exports = {
  calculatePointsRepo,
};
