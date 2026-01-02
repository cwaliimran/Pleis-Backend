const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const BadgesRepo = require("./badgesRepository");
const { userReservationsFormatter } = require("../reservations/formaters/reservationFormetter");
const mongoose = require('mongoose'); 



const addUserBadges = async (data) => {
  let Badges = await BadgesRepo.addUserBadges(data);
  return Badges;
};
const getBadgess = async ({ timezone, page, limit, keyword, status, userId, date }) => {
  try {
    let { badges, meta } = await BadgesRepo.getBadgess({ timezone, page, limit, keyword, status, userId, date });
    if (!badges || badges.length === 0) {
      return { badges: [], meta };
    }
    // Badgess = Badgess.map(Badges => BadgesFormatter(Badges, timezone));
    return {
      badges,
      meta
    };
  } catch (error) {
    return {
      badges: [],
      meta: { totalRecords: 0, currentPage: 1, totalPages: 1, limit: 10 }
    };
  }
};
const detailBadgess = async (id) => {
  try {
    let badges = await BadgesRepo.detailBadgess(id);
    if (!badges || badges.length === 0) {
      return [];
    }
    return badges
  } catch (error) {
    return []
  }
};
module.exports = {
  addUserBadges,
  getBadgess,
detailBadgess

};