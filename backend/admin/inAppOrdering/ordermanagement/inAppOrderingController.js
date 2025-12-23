const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../../helperUtils/responseUtil");
const mongoose = require('mongoose'); // Import mongoose

const Orderservice = require("./inAppOrderingService");





const createOrders = async (req, res) => {
  let {
    title,
    ticket,
    event,
    numberOfWinners,
    status="active",
    ticketsPerWinner,
    organization,
    endDateTime,
    OrdersStatus="live",

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
    OrdersStatus,
    status,
  };
  try {
    const Orders = await Orderservice.createOrders(data);
    if (!Orders) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Orders_creation_failed",
      });
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "Orders_created_successfully",
      data: Orders,
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
const getOrders = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status , date, range ,organizationId,activeKeyword,orderStatus,activeorderStatus,pickupFilter} = req.query;
  try {
if(!organizationId){
  return sendResponse({
    res,
    statusCode: 400,
    translationKey: "organization_id_is_required",
  });
}

    organizationId = new  mongoose.Types.ObjectId(organizationId); 
    const timezone = req.user.timezone;
    const { Orderss, meta } = await Orderservice.getOrders({
      timezone,
      page,
      limit,
      keyword,
      status,
      organizationId,
      date,
      range,
      activeKeyword,
      orderStatus,
      activeorderStatus,
      pickupFilter
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Orders_fetched_successfully",
      data: Orderss,
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
const updateOrders = async (req, res) => {
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
  OrdersStatus ,
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
  OrdersStatus,
};



  try {
    const updated = await Orderservice.updateOrders(id, data);
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
        translationKey: "Reservation_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Reservation_updated_successfully",
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

const deleteOrders = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await Orderservice.deleteOrders(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Orders_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Orders_deleted_successfully",
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
    const { events, meta } = await Orderservice.getevents({
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
    const { tickets, meta } = await Orderservice.gettickets({
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
  let { keyword, status , date, range ,OrdersId} = req.query;
  try {
if(!OrdersId){
  return sendResponse({
    res,
    statusCode: 400,
    translationKey: "Orders_id_is_required",
  });
}

    OrdersId = new  mongoose.Types.ObjectId(OrdersId); 
    const timezone = req.user.timezone;
    const { winners, meta } = await Orderservice.getWinners({
      timezone,
      page,
      limit,
      keyword,
      status,
      userId:req.user._id,
      date,
      range,
      OrdersId
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Orders_winners_fetched_successfully",
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
  createOrders,
  getOrders,
  updateOrders,
  deleteOrders,
  getevents,
  gettickets,
  getWinners
};