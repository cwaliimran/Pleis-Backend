const { TicketingOrders } = require("@TicketingOrdersModel");
const { ticketingOrderFinalizerService } = require("../../commonModules/paymentsIntegrations/dummyChargeForTesting/orderFinalizers/ticketingOrderFinalizerService");
const {
  sendResponse,
  validateParams,
} = require("../../helperUtils/responseUtil");

async function testPayTicketingOrder(req, res) {
  try {
    if (
      !validateParams(req, res, {
        pathParams: ["id"],
        objectIdFields: ["id"],
      })
    ) {
      return;
    }

    const order = await TicketingOrders.findById(req.params.id);
    if (!order) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "order_not_found",
      });
    }

    const alreadyPaid =
      order.status === "paid" ||
      order.paymentDetails?.paymentStatus === "paid";

    if (alreadyPaid) {
      return sendResponse({
        res,
        statusCode: 200,
        translationKey: "ticketing_already_paid",
        data: {
          orderId: String(order._id),
          status: order.status,
          paymentStatus: order.paymentDetails?.paymentStatus,
          note: "ticketing_invoices enqueue on first staff check-in, not at payment",
        },
      });
    }

    if (order.status !== "pendingPayment") {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "order_not_pending_payment",
        data: { status: order.status },
      });
    }

    const transactionId = `ADMIN_TEST_${Date.now()}`;
    await ticketingOrderFinalizerService({
      orderId: order._id,
      result: {
        status: "paid",
        transactionId,
      },
    });

    const updated = await TicketingOrders.findById(order._id)
      .select("status paymentDetails orderPricing ticketsPurchased")
      .lean();

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "ticketing_marked_paid_for_test",
      data: {
        orderId: String(order._id),
        transactionId,
        status: updated?.status,
        paymentStatus: updated?.paymentDetails?.paymentStatus,
        note: "ticketing_invoices enqueue on first staff check-in, not at payment",
      },
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server_error",
      error,
    });
  }
}

module.exports = { testPayTicketingOrder };
