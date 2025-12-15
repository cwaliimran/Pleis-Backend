const { getSuggestedLoyaltyClubs } = require("../../organizationProfile/organizationProfileService");
const { getUserJoinedClubsWithPoints } = require("../clubMembers/clubMembersService");



const getDashboards = async ({ timezone, userId }) => {

  let [joinedClubs, suggestedClubs] = await Promise.all([
    getUserJoinedClubsWithPoints(userId),
    getSuggestedLoyaltyClubs({ userId }),
  ]);

  return {
    dashboards: {
      joinedClubs: joinedClubs || [],
      suggestedClubs: suggestedClubs || [],
    }
  };
};

module.exports = {
  getDashboards,
};
