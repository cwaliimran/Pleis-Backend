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
const { getOrdersService } = require("../../../admin/inAppOrdering/ordermanagement/inAppOrderingService");


const getOrders = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status, date, range, organization, activeKeyword, orderStatus, activeorderStatus, pickupFilter } = req.query;
  try {
    if (!organization) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "organization_is_required",
      });
    }

    const timezone = req.user.timezone;
    const { Orderss, meta } = await getOrdersService({
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

const updateIsOrderingEnabled = async (req, res) => {
  let { organization, isOrderingEnabled } = req.body;

  if (
    !validateParams(req, res, {
      rawData: [
        "organization",
        "isOrderingEnabled"
      ],
    })
  ) return;

  try {
    const result = await Orderservice.updateIsOrderingEnabledService(organization, isOrderingEnabled);

    if (result && result.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: result.error,
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "ordering_status_updated_successfully",
      data: result,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode || 500,
      translationKey: readableError.message,
      error,
    });
  }
};

module.exports = {
  getOrders,
  updateOrders,
  updateIsOrderingEnabled
};