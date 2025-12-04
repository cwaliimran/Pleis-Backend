const { getSuggestedLoyaltyClubs } = require("../../organizationProfile/organizationProfileService");
const { getUserWallet } = require("../../userWalletService/global/walletManagement/userWalletService");
const { getUserJoinedClubsWithPoints } = require("../clubMembers/clubMembersService");



const getDashboards = async ({ timezone, userId }) => {

  let [globalLoyalty, joinedClubs, suggestedClubs] = await Promise.all([
    getUserWallet(userId),
    getUserJoinedClubsWithPoints(userId),
    getSuggestedLoyaltyClubs({ userId }),
  ]);

  return {
    dashboards: {
      globalLoyalty: globalLoyalty?.global || null,
      joinedClubs: joinedClubs || [],
      suggestedClubs: suggestedClubs || [],
    }
  };
};

module.exports = {
  getDashboards,
};
