// services/checkoutOrchestratorService.js
const mongoose = require("mongoose");
const { createTicketingBookingService } = require("../ticketingBookingService");
const { createReservationService } = require("../../../reservations/reservationService");

const checkoutWithTicketsAndReservation = async ({
  user,
  timezone,
  ticketings,
  reservation,
  paymentDetails,
}) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { order, tickets } =
      await createTicketingBookingService(
        {
          user: user._id,
          ticketings,
          paymentDetails,
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
          ticketingOrderRef: order._id,
          ticketingBookingRefs: tickets.map(t => t._id),
        },
        session
      );

    await TicketingBookings.updateMany(
      { _id: { $in: tickets.map(t => t._id) } },
      { $set: { reservationRef: reservationResult._id } },
      { session }
    );

    await session.commitTransaction();

    return {
      orderId: order._id,
      reservationId: reservationResult._id,
      ticketingBookingIds: tickets.map(t => t._id),
    };

  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    throw err;
  } finally {
    session.endSession();
  }
};


module.exports = { checkoutWithTicketsAndReservation };
