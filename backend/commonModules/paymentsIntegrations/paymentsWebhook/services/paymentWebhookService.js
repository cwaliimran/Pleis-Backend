const { saveIfNotProcessed } = require("../repositories/webhookRepository");

const { ticketingOrderFinalizerService } = require("../../dummyChargeForTesting/orderFinalizers/ticketingOrderFinalizerService");
const { reservationOrderFinalizerService } = require("../../dummyChargeForTesting/orderFinalizers/reservationOrderFinalizerService");

const processPaymentWebhook = async ({
  provider,
  eventId,
  type,
  orderId,
  paymentStatus,
  paymentId,
  payload,
}) => {
  const event = await saveIfNotProcessed({
    provider,
    eventId,
    type,
    orderId,
    payload,
  });
  
  if (!event) return; // idempotent exit

  const result = {
    status: paymentStatus,
    paymentId,
  };

  if (type === "ticketing") {
    await ticketingOrderFinalizerService({ orderId, result });
  }
  if (type === "reservation") {
    await reservationOrderFinalizerService({ reservationId: orderId, result });
  }
};

module.exports = { processPaymentWebhook };
