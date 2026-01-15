const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../../helperUtils/responseUtil");
const mongoose = require('mongoose'); // Import mongoose

const Orderservice = require("./inAppOrderingService");
const getOrders = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status, date, range, organization, activeKeyword, orderStatus, activeorderStatus, pickupFilter } = req.query;
  try {
    if (!organization) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "organization_id_is_required",
      });
    }


    const timezone = req.user.timezone;
    const { Orderss, meta } = await Orderservice.getOrdersService({
      timezone,
      page,
      limit,
      keyword,
      status,
      organization,
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
  ) return;


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











const updateInAppOrders = async (req, res) => {
  const { organization } = req.params;
  const {
    isOrderingEnabled
  } = req.body;
  if (
    !validateParams(req, res, {
      pathParams: ["organization"],
      objectIdFields: ["organization"],
    })
  ) return;

  try {
    const { matchedCount,
      modifiedCount } = await Orderservice.updateInAppOrders(organization, isOrderingEnabled);

    if (!modifiedCount) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "order_not_found",
      });
    }
    if (isOrderingEnabled == "true" || isOrderingEnabled == true) {
      return sendResponse({
        res,
        statusCode: 200,
        translationKey: `in_app_ordering_${isOrderingEnabled ? "enabled" : "disabled"}`,
      });
    } else {
      return sendResponse({
        res,
        statusCode: 200,
        translationKey: "in_app_ordering_disabled",
      });
    }
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


const getInAppOrders = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status, date, range, organization } = req.query;
  try {
    if (!organization) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "company_organizer_is_required",
      });
    }

    organization  = new mongoose.Types.ObjectId(organization);
    const timezone = req.user.timezone;
    const data = await Orderservice.getInAppOrders({
      timezone,
      page,
      limit,
      keyword,
      status,
      organization,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Orders_fetched_successfully",
      data: data,
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
  updateInAppOrders,
  getInAppOrders
};