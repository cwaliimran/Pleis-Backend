/**
 * Edit order endpoints (#129, #130).
 *   PUT /staff/in-app-ordering/:id/edit                       staff app
 *   PUT /admin|organizer/in-app-ordering/ordermanagement/:id/edit   admin panel
 *   PUT …/ordermanagement/update-order/:id                    same, kept path
 *
 * Body: { items?: [{ lineId?, menuItem, quantity }], combos?: [{ lineId?, combo,
 *         items, quantity }], tableNumber?, pickupType?, deliveryOption?, notes?,
 *         paymentMethod? }
 */
const { sendResponse, getReadableErrorMessage } = require("@utils/responseUtil");
const { editOrderBeforePayment } = require("./orderEditService");
const { orderScopeCheck: scopeCheckFor } = require("./orderScope");

const editOrder = (via) => async (req, res) => {
  const { items, combos, tableNumber, pickupType, deliveryOption, notes, paymentMethod } = req.body || {};
  try {
    const order = await editOrderBeforePayment({
      orderId: req.params.id,
      actor: {
        userId: req.user.originalUserId || req.user._id,
        name: `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim(),
        role: req.user.originalUserId ? "manager" : req.user.userType,
        via,
      },
      input: { items, combos, tableNumber, pickupType, deliveryOption, notes, paymentMethod },
      timezone: req.user.timezone,
      assertScope: scopeCheckFor(req),
    });
    return sendResponse({ res, statusCode: 200, translationKey: "order_updated_successfully", data: order });
  } catch (error) {
    const readable = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: error?.statusCode || readable.statusCode || 500,
      translationKey: error?.statusCode ? error.message : readable.message,
    });
  }
};

module.exports = {
  editOrderFromStaffApp: editOrder("mobile_staff_app"),
  editOrderFromAdmin: editOrder("web_admin_app"),
};
