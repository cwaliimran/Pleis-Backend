const { saveIfNotProcessed } = require("../repositories/webhookRepository");

const { ticketingOrderFinalizerService } = require("../../dummyChargeForTesting/orderFinalizers/ticketingOrderFinalizerService");
const { reservationOrderFinalizerService } = require("../../dummyChargeForTesting/orderFinalizers/reservationOrderFinalizerService");

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

  if (orderType === "ticketing") {
    await ticketingOrderFinalizerService({ orderId, result });
  }

  if (orderType === "reservation") {
    await reservationOrderFinalizerService({
      reservationId: orderId,
      result,
    });
  }

  return {
    handled: true,
  };
};


module.exports = { processPaymentWebhook };
