const { TicketingOrders } = require("@TicketingOrdersModel");
const { UserReservations } = require("@UserReservationsModel");
const { fakeCharge } = require("./dummyPaymentGateway");


/* 
attemptTicketingOrdersPayment must NOT update DB.
It should only:

talk to gateway

return intent result

All DB updates belong in finalizeOrder inside a transaction
*/
//TODO dummy implementation
const attemptTicketingOrdersPayment = async (orderId) => {
  const order = await TicketingOrders.findById(orderId);
  if (!order) throw new Error("order_not_found");

  if (order.paymentDetails.paymentStatus !== "pending") {
    return {
      status: order.paymentDetails.paymentStatus, // paid | failed | refunded
      transactionId: order.paymentDetails.transactionId || null,
    };
  }

  // 🔥 Call payment gateway
  const result = await fakeCharge({
    orderId,
    amount: order.orderPricing.total,
  });

  if (result.success) {
    return {
      status: "paid",
      transactionId: result.transactionId,
    };
  }

  if (result.timeout) {
    return { status: "pending" };
  }

  return { status: "failed" };
};



/*
attemptUserReservationOrderPayment MUST NOT update DB.
It should only:
- talk to gateway
- return intent result
*/
const attemptUserReservationOrderPayment = async (reservationId) => {
  const reservation = await UserReservations.findById(reservationId);
  if (!reservation) throw new Error("reservation_not_found");

  // 🔒 Already resolved → return current state
  if (reservation.paymentDetails.paymentStatus !== "pending") {
    return {
      status: reservation.paymentDetails.paymentStatus, // paid | failed | refunded
      transactionId: reservation.paymentDetails.transactionId || null,
    };
  }

  // 💰 Amount resolution
  // Prefer explicit reservation.amount, fallback to 0
  const amount = reservation.amount || 0;

  // 🆓 Free reservation → auto success
  if (amount === 0) {
    return {
      status: "paid",
      transactionId: "FREE_RESERVATION",
    };
  }

  // 🔥 Call payment gateway
  const result = await fakeCharge({
    orderId: reservationId,
    amount,
  });

  if (result.success) {
    return {
      status: "paid",
      transactionId: result.transactionId,
    };
  }

  if (result.timeout) {
    return { status: "pending" };
  }

  return { status: "failed" };
};


module.exports = { attemptTicketingOrdersPayment, attemptUserReservationOrderPayment };
