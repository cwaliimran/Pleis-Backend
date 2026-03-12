// services/checkoutOrchestratorService.js
const { createTicketingBookingService } = require("../ticketingBookingService");
const { createReservationService } = require("../../../reservations/reservationService");
const { TicketingBookings } = require("@TicketingBookingsModel");

const checkoutWithTicketsAndReservation = async ({
  user,
  timezone,
  ticketings,
  reservation,
  paymentDetails,
  userBillingInformation,
  promoCode,
}, session) => {
  const { order, tickets } =
    await createTicketingBookingService(
      {
        user: user._id,
        ticketings,
        paymentDetails,
        userBillingInformation,
        promoCode,
      },
      timezone,
      session
    );

  const reservationResult =
    await createReservationService(
      {
        ...reservation,
        userId: user._id,
        paymentDetails,
        userBillingInformation,
        ticketingOrderRef: order._id,
        ticketingBookingRefs: tickets.map(t => t._id),
      },
      session
    );

  if (!reservationResult?.success) {
    return {
      success: false,
      error: reservationResult.error
    };
  }

  await TicketingBookings.updateMany(
    { _id: { $in: tickets.map(t => t._id) } },
    { $set: { reservationRef: reservationResult.reservation._id } },
    { session }
  );

  return {
    success: true,
    orderId: order._id,
    reservationId: reservationResult.reservation._id,
    ticketingBookingIds: tickets.map(t => t._id),
  };
};

module.exports = { checkoutWithTicketsAndReservation };
