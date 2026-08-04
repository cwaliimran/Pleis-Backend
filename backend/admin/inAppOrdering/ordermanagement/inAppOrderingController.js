const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../../helperUtils/responseUtil");
const mongoose = require("mongoose"); // Import mongoose

const Orderservice = require("./inAppOrderingService");
const getOrders = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let {
    keyword,
    status,
    paymentMethod,
    date,
    range,
    organization,
    pickupFilter,
    orderStatus
  } = req.query;
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
      paymentMethod,
      pickupFilter,
      orderStatus,
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
    deliveredall,
    reasonForRejection,
    reasonForCancellation,
    noteForRejection,
    noteForCancellation,
    paymentMethod,
  } = req.body;
  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  let data = {
    status,
    paymentStatus,
    deliveredMenuItem,
    deliveredall,
    reasonForRejection,
    reasonForCancellation,
    noteForRejection,
    noteForCancellation,
    updateBy: req.user._id,
    paymentMethod,
  };

  try {
    const updated = await Orderservice.updateOrderDetailsService({
      orderId: id,
      data,
    });
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
  let { isOrderingEnabled } = req.body;

  if (
    !validateParams(req, res, {
      pathParams: ["organization"],
      objectIdFields: ["organization"],
    })
  )
    return;

  // normalize boolean
  isOrderingEnabled =
    isOrderingEnabled === true || isOrderingEnabled === "true";

  try {
    await Orderservice.updateInAppOrders(organization, isOrderingEnabled);

    return sendResponse({
      res,
      statusCode: 200,
      data: isOrderingEnabled,
      translationKey: `in_app_ordering_${
        isOrderingEnabled ? "enabled" : "disabled"
      }`,
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

    organization = new mongoose.Types.ObjectId(organization);
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

const sendPaymentReminder = async (req, res) => {
  const { orderId } = req.query;

  if (
    !validateParams(req, res, {
      queryParams: ["orderId"],
      objectIdFields: ["orderId"],
    })
  )
    return;

  try {
    const result = await Orderservice.sendPaymentReminder(orderId);

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
      translationKey: "payment_reminder_sent_successfully",
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
  getInAppOrders,
  sendPaymentReminder,
};
