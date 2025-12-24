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
const {
  status,
  paymentStatus,
  deliveredMenuItem,
  deliveredall
} = req.body;
  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )    return;


let data = {
  status,
  paymentStatus,
  deliveredMenuItem,
  deliveredall
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
        translationKey: "order_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "order_updated_successfully",
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















module.exports = {
  getOrders,
  updateOrders,
};