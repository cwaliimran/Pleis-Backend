const { saveIfNotProcessed } = require("../repositories/webhookRepository");

const { ticketingOrderFinalizerService } = require("../../dummyChargeForTesting/orderFinalizers/ticketingOrderFinalizerService");
const { reservationOrderFinalizerService } = require("../../dummyChargeForTesting/orderFinalizers/reservationOrderFinalizerService");
const { menuOrderFinalizerService } = require("../../dummyChargeForTesting/orderFinalizers/menuOrderFinalizerService");
const { ticketingTransferFinalizerService } = require("../../dummyChargeForTesting/orderFinalizers/ticketingTransferFinalizerService");

const processPaymentWebhook = async ({
  provider,
  eventId,
  orderType,
  orderId,
  paymentStatus,
  paymentId,
  payload,
}) => {
  const event = await saveIfNotProcessed({
    provider,
    eventId,
    orderType,
    orderId,
    paymentStatus,
    paymentId,
    payload,
  });

  // 👇 EXPLICIT RESULT
  if (!event) {
    return {
      handled: false,
      reason: "duplicate event",
    };
  }

  const result = {
    status: paymentStatus,
    paymentId,
  };

  if (orderType === "ticketingbookings") {
    await ticketingOrderFinalizerService({ orderId, result });
  }

  if (orderType === "tickettransfer") {
    let metadata = payload.transaction.metadata
    await ticketingTransferFinalizerService({ bookingId: metadata.bookingId, userId: metadata.userId, newUserId: metadata.newUserId, result: payload.transaction });
  }

  if (orderType === "userreservations") {
    await reservationOrderFinalizerService({
      reservationId: orderId,
      result,
    });
  }
  if (orderType === "menuorders") {
    await menuOrderFinalizerService({
      menuOrderId: orderId,
      result,
    });
  }

  return {
    handled: true,
  };
};


module.exports = { processPaymentWebhook };
