const orderService = require("./orderService");
const { sendResponse, getReadableErrorMessage, validateParams, parsePaginationParams } = require("@utils/responseUtil");

const placeOrder = async (req, res) => {
  const {
    items = [],
    combos = [],
    notes,
    paymentMethod = null,
    pickupType,
    tableNumber,
    deliveryOption,
    promoCode,
    userId,
    paymentTiming,
    tip,
    reservationId,
  } = req.body;
  try {
    let validateData = {
      rawData: ["paymentMethod", "deliveryOption"],
      enumFields: {
        pickupType: ["counter", "tableService", "togo"],
        paymentMethod: ["applePay", "card", "cash", "payLater"],
      },
      objectIdFields: ["deliveryOption"],
    };

    if (pickupType === "tableService") {
      validateData.rawData.push("tableNumber");
    }
    if (paymentTiming === undefined) {
      validateData.rawData.push("paymentTiming");
    }
    if (paymentTiming !== undefined) {
      validateData.enumFields.paymentTiming = ["payNow", "payLater"];
    }

    if (!validateParams(req, res, validateData)) return;

    const { order } = await orderService.placeOrder({
      userId: userId || req.user._id,
      timezone: req.user.timezone,
      items,
      combos,
      notes,
      paymentMethod,
      pickupType,
      tableNumber,
      promoCode,
      tip,
      reservationId,
      deliveryOption,
      paymentTiming,
    });

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "order_placed_successfully",
      data: order,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode || 400,
      translationKey: readableError.message,
      error,
    });
  }
};

const updateOrderDetails = async (req, res) => {
  const { items, combos, notes, paymentMethod, pickupType, tableNumber, deliveryOption, promoCode, tip, userId } =
    req.body;

  const { id: orderId } = req.params;

  try {
    const validateData = {
      rawData: [],
      enumFields: {},
    };

    // Validate only if field was provided
    if (pickupType !== undefined) {
      validateData.rawData.push("pickupType");

      validateData.enumFields.pickupType = ["counter", "tableService", "togo"];
    }

    if (paymentMethod !== undefined) {
      validateData.rawData.push("paymentMethod");

      validateData.enumFields.paymentMethod = ["applePay", "card", "cash", "payLater"];
    }

    // tableNumber is required when changing pickupType
    // to tableService
    if (pickupType === "tableService" && tableNumber === undefined) {
      validateData.rawData.push("tableNumber");
    }

    if (!validateParams(req, res, validateData)) return;

    if (!orderId) {
      throw new Error("Order ID is required");
    }

    const { order } = await orderService.updateOrder({
      orderId,
      userId: userId || req.user._id,
      timezone: req.user.timezone,

      // Keep these undefined if not supplied.
      // undefined = don't update.
      items,
      combos,
      notes,
      paymentMethod,
      pickupType,
      tableNumber,
      deliveryOption,
      promoCode,
      tip,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "order_updated_successfully",
      data: order,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);

    return sendResponse({
      res,
      statusCode: readableError.statusCode || 400,
      translationKey: readableError.message,
      error,
    });
  }
};

const addMoreItemsToOrder = async (req, res) => {
  const { orderId, items } = req.body;
  try {
    let validateData = {
      rawData: ["orderId", "items"],
    };

    if (!validateParams(req, res, validateData)) return;

    const { order } = await orderService.addMoreItemsToOrder({
      userId: req.user._id,
      timezone: req.user.timezone,
      orderId,
      items,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "items_added_to_order_successfully",
      data: order,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode || 400,
      translationKey: readableError.message,
      error,
    });
  }
};

const getOrderDetails = async (req, res) => {
  const { id } = req.params;

  if (!validateParams(req, res, { pathParams: ["id"], objectIdFields: ["id"] })) return;
  const timezone = req.user.timezone || "Asia/Kolkata";

  try {
    const result = await orderService.getOrderDetails(id, timezone);
    if (!result || !result.order) {
      return sendResponse({ res, statusCode: 404, translationKey: "order_not_found" });
    }
    const { order } = result;
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "order_details_fetched_successfully",
      data: order,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode || 400,
      translationKey: readableError.message,
      error,
    });
  }
};

const getUserOrders = async (req, res) => {
  try {
    const { page, limit } = parsePaginationParams(req);
    const { orders, meta } = await orderService.getUserOrders(req.user._id, page, limit);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "orders_fetched_successfully",
      data: orders,
      meta,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode || 400,
      translationKey: readableError.message,
      error,
    });
  }
};

module.exports = { placeOrder, getOrderDetails, getUserOrders, addMoreItemsToOrder, updateOrderDetails };
