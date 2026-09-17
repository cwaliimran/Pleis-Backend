const { User } = require("@UsersModel");
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
  let totalSpendingCompany = Number(totalSpending || 0);
  const company = await User.findById(companyOrganizer);
  if (company.companyDetails.status !== "active") {
    totalSpendingCompany = 0;
  }
  const [
    globalWallet,
    userCompanyWallet,
    userDoc,
  ] = await Promise.all([
    getUserWallet(userId),
    getUserCompanyWallet(userId, companyOrganizer),
    User.findById(userId).select("timezone").lean(),
  ]);

  const timezone = userDoc?.timezone || "UTC";

  const [
    globalLoyaltyHappyHourPromotion,
    loyaltyHappyHourPromotion,
  ] = await Promise.all([
    getActiveGlobalLoyaltyHappyHourPromotion({
      userId,
      userTierEntryPoints:
        globalWallet?.global?.level?.entryPoints,
      timezone,
    }),
    getActiveLoyaltyHappyHourPromotion({
      companyOrganizer,
      userId,
      userTierEntryPoints:
        userCompanyWallet?.level?.entryPoints ?? 0,
      timezone,
    }),
  ]);

  const globalBonus =
    globalWallet?.global?.level?.bonusPointsPerEuro || 0;

  const tierBonus =
    userCompanyWallet?.level?.bonusPointsPerEuro || 0;

  const organizerMultiplier =
    loyaltyHappyHourPromotion?.pointsMultiplier || 1;

  const globalMultiplier =
    globalLoyaltyHappyHourPromotion?.pointsMultiplier || 1;

  const organizerPointsPerEuro =
    10 + tierBonus + globalBonus;

  const organizerEarnedPoints = Math.round(
    totalSpendingCompany *
    organizerPointsPerEuro *
    organizerMultiplier
  );


  const globalPointsPerEuro =
    10 + globalBonus + tierBonus;

  const globalEarnedPoints = Math.round(
    totalSpending *
    globalPointsPerEuro *
    globalMultiplier
  );

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
      globalMultiplier,
      cashback,
    },

    organizer: {
      pointsPerEuro: organizerPointsPerEuro,
      earnedPoints: organizerEarnedPoints,
      organizerMultiplier,
      cashback,
    },
  };
};


module.exports = {
  calculatePointsRepo,
};
