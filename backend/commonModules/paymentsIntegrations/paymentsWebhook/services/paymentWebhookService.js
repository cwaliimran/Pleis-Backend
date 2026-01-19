const { saveIfNotProcessed } = require("../repositories/webhookRepository");

const { ticketingOrderFinalizerService } = require("../../dummyChargeForTesting/orderFinalizers/ticketingOrderFinalizerService");
const { reservationOrderFinalizerService } = require("../../dummyChargeForTesting/orderFinalizers/reservationOrderFinalizerService");
const { menuOrderFinalizerService } = require("../../dummyChargeForTesting/orderFinalizers/menuOrderFinalizerService");

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
