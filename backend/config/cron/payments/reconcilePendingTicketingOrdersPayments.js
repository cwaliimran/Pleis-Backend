const { TicketingOrders } = require("@TicketingOrdersModel");
const { attemptTicketingOrdersPayment } = require("../../../commonModules/paymentsIntegrations/dummyChargeForTesting/paymentService");
const { ticketingOrderFinalizerService } = require("../../../commonModules/paymentsIntegrations/dummyChargeForTesting/orderFinalizers/ticketingOrderFinalizerService");

const reconcilePendingTicketingOrdersPayments = async () => {
  const orders = await TicketingOrders.find({
    status: "pendingPayment",
    // lockUntil: { $lt: new Date() },
  });

  // 
  for (const order of orders) {
    const result = await attemptTicketingOrdersPayment(order._id);
    await ticketingOrderFinalizerService({ orderId: order._id, result });
  }
};

module.exports = { reconcilePendingTicketingOrdersPayments };
