const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const GiveawayRepo = require("./giveawayRepository");
const { sendUserNotifications } = require("../../controllers/communicationController");
const { NotificationTypes } = require("@NotificationsModel");


const createGiveaway = async (data) => {

  let Giveaway = await GiveawayRepo.createGiveaway(data);
  return Giveaway;
};
const getGiveaway = async ({ eventId,timezone, page, limit, keyword, status, userId,  date, range }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { Giveaways, meta } = await GiveawayRepo.getGiveaway({ eventId,timezone, page, limit, keyword, status, userId,  date, range, today, skip });

  return {
    Giveaways,
    meta
  };
};




module.exports = {
  createGiveaway,
  getGiveaway,


};