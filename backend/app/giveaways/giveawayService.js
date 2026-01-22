const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const GiveawayRepo = require("./giveawayRepository");
const { NotificationTypes } = require("@NotificationsModel");
const { formatGiveaways } = require("./formatters/updateFormatter");


const createGiveaway = async (data) => {

  let Giveaway = await GiveawayRepo.createGiveaway(data);
  return Giveaway;
};
const getGiveaway = async ({ eventId, timezone, page = 1, limit = 10, keyword, status, userId, date, range }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { Giveaways, meta } = await GiveawayRepo.getGiveaway({ eventId, timezone, page, limit, keyword, status, userId, date, range, today, skip });

  return {
    Giveaways,
    meta
  };
};

const getGiveawaysByEventIdService = async (eventId, timezone) => {
  let giveaways = await GiveawayRepo.getGiveawaysByEventId(eventId, timezone);
  giveaways = formatGiveaways(giveaways);
  return giveaways;
}



module.exports = {
  createGiveaway,
  getGiveaway,
  getGiveawaysByEventIdService

};