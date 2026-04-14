const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../helperUtils/responseUtil");
const mongoose = require('mongoose'); // Import mongoose

const Giveawayervice = require("./GiveawayService");





const createGiveaway = async (req, res) => {
  let {
giveaway
  } = req.body;

   giveaway = new mongoose.Types.ObjectId(giveaway)

  if (
    !validateParams(req, res, {
      rawData: [
        "giveaway",
      ],
    })
  ) return;

  let data = {
giveaway,
user: req.user._id,
  };
  try {
    const Giveaway = await Giveawayervice.createGiveaway(data);
    if (!Giveaway) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Giveaway_creation_failed",
      });
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "Giveaway_created_successfully",
      data: Giveaway,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  }
};
const getGiveaway = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status, date, range, eventId } = req.query;
  try {
    if (!eventId) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "event_id_is_required",
      });
    }

    eventId = new mongoose.Types.ObjectId(eventId);
    const userId = req.user._id;
    const timezone = req.user.timezone;
    const { Giveaways, meta } = await Giveawayervice.getGiveaway({
      timezone,
      page,
      limit,
      keyword,
      eventId,
      status,
      userId,
      date,
      range
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Giveaway_fetched_successfully",
      data: Giveaways,
      meta,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  }
};

module.exports = {
  createGiveaway,
  getGiveaway,

};