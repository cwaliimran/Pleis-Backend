const orderService = require("./orderService");
const { sendResponse, getReadableErrorMessage, validateParams } = require("@utils/responseUtil");

const placeOrder = async (req, res) => {
  const { items, deliveryAddress, paymentMethod, pickupType,
    tableNumber, } = req.body;
  try {

    let validateData = {
      rawData: [
        "items",
        "pickupType",
        "paymentMethod",
        "deliveryAddress",
      ],
      enumFields: {
        pickupType: ["counter", "tableService"],
        paymentMethod: ["applePay", "card", "cash", "payLater"],
      },
    }

    if (pickupType === "tableService") {
      validateData.rawData.push("tableNumber");
    }


    if (!validateParams(req, res, validateData)) return;

    const { order } = await orderService.placeOrder({
      userId: req.user._id,
      timezone: req.user.timezone,
      items,
      deliveryAddress,
      paymentMethod,
      pickupType,
      tableNumber,
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

const getOrderDetails = async (req, res) => {
  const { id } = req.params;

  if (!validateParams(req, res, { pathParams: ["id"], objectIdFields: ["id"] })) return;

  try {
    const result = await orderService.getOrderDetails(id);
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
    const { orders } = await orderService.getUserOrders(req.user._id);
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "orders_fetched_successfully",
      data: orders,
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

module.exports = { placeOrder, getOrderDetails, getUserOrders };
