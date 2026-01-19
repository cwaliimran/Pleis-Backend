const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../helperUtils/responseUtil");
const mongoose = require('mongoose'); // Import mongoose

const Giveawayervice = require("./giveawayService");





const createGiveaway = async (req, res) => {
  let {
    title,
    ticket,
    event,
    numberOfWinners,
    status="active",
    ticketsPerWinner,
    organization,
    endDateTime,
    giveawayStatus="live",

  } = req.body;

  const creator = new  mongoose.Types.ObjectId(organization);
  const timezone = req.user.timezone;
  endDateTime = convertTimezoneToUtc(
    endDateTime,
    timezone,
    "YYYY-MM-DD hh:mm A"
  );

  if (
    !validateParams(req, res, {
      rawData: [
        "title",
        "ticket",
        "ticketsPerWinner",
        "organization",
        "endDateTime",
        "numberOfWinners",
        "event",
      ],
    })
  ) return;
 
  let data = {
    creator,
    title,
    ticket,
    event,
    numberOfWinners,
    ticketsPerWinner,
    organization,
    endDateTime,
    giveawayStatus,
    status,
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
  const { keyword, status , date, range ,organizationId} = req.query;
  try {
if(!organizationId){
  return sendResponse({
    res,
    statusCode: 400,
    translationKey: "organization_id_is_required",
  });
}

    const userId = new  mongoose.Types.ObjectId(organizationId); 
    const timezone = req.user.timezone;
    const { Giveaways, meta } = await Giveawayervice.getGiveaway({
      timezone,
      page,
      limit,
      keyword,
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
const updateGiveaway = async (req, res) => {
  const { id } = req.params;
let {
  title,
  ticket,
  event,
  numberOfWinners,
  ticketsPerWinner,
  organization,
  endDateTime,
  status ,
  giveawayStatus ,
} = req.body;
  const creator = req.user._id;
  const timezone = req.user.timezone;
  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )    return;
  if(endDateTime){
  endDateTime = convertTimezoneToUtc(
  endDateTime,
  timezone,
  "YYYY-MM-DD hh:mm A"
);
  }

let data = {
  creator,
  title,
  ticket,
  event,
  numberOfWinners,
  ticketsPerWinner,
  organization,
  endDateTime,
  status,
  giveawayStatus,
};



  try {
    const updated = await Giveawayervice.updateGiveaway(id, data);
    if (updated && updated.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: updated.error,
      });
    }

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "giveaway_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "giveaway_updated_successfully",
      data: updated,
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

const deleteGiveaway = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await Giveawayervice.deleteGiveaway(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Giveaway_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Giveaway_deleted_successfully",
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







const getevents = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status = "active", date, range,organizationId } = req.query;
  try {

if(!organizationId){
  return sendResponse({
    res,
    statusCode: 400,
    translationKey: "organization_id_is_required",
  });
}
 organizationId =new  mongoose.Types.ObjectId(organizationId); // Convert organizationId to MongoDB ObjectId

    const timezone = req.user.timezone;
    const { events, meta } = await Giveawayervice.getevents({
      timezone,
      page,
      limit,
      keyword,
      status,
      organizationId,
      date,
      range
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "events_fetched_successfully",
      data: events,
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

const gettickets = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status , date, range, eventId } = req.query;

  try {
    // eventId is required to fetch tickets for a specific event
    if (!eventId) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "event_id_is_required",
      });
    }

    const userId = req.user._id;
    const timezone = req.user.timezone;
    const { tickets, meta } = await Giveawayervice.gettickets({
      timezone,
      page,
      limit,
      keyword,
      status,
      userId,
      date,
      range,
      eventId
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "tickets_fetched_successfully",
      data: tickets,
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






const getWinners = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status , date, range ,giveawayId} = req.query;
  try {
if(!giveawayId){
  return sendResponse({
    res,
    statusCode: 400,
    translationKey: "giveaway_id_is_required",
  });
}

    giveawayId = new  mongoose.Types.ObjectId(giveawayId); 
    const timezone = req.user.timezone;
    const { winners, meta } = await Giveawayervice.getWinners({
      timezone,
      page,
      limit,
      keyword,
      status,
      userId:req.user._id,
      date,
      range,
      giveawayId
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Giveaway_winners_fetched_successfully",
      data: winners,
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
  updateGiveaway,
  deleteGiveaway,
  getevents,
  gettickets,
  getWinners
};