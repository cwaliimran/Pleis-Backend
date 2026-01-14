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
  let { keyword, status, date, range, organizationId, activeKeyword, orderStatus, activeorderStatus, pickupFilter } = req.query;
  try {
    if (!organizationId) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "organization_id_is_required",
      });
    }

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
  let { companyOrganizer } = req.params;
    companyOrganizer = req.user._id;

  const {
    isOrderingEnabled
  } = req.body;
  try {
    const { matchedCount,
      modifiedCount } = await Orderservice.updateInAppOrders(companyOrganizer, isOrderingEnabled);

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
  let { keyword, status, date, range, } = req.query;
  const companyOrganizer = req.user._id;
  try {
    if (!companyOrganizer) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "company_organizer_is_required",
      });
    }

    creator = new mongoose.Types.ObjectId(companyOrganizer);
    const timezone = req.user.timezone;
    const data = await Orderservice.getInAppOrders({
      timezone,
      page,
      limit,
      keyword,
      status,
      creator,
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