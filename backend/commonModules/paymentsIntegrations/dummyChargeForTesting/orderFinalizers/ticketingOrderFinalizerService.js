const mongoose = require("mongoose");
const { TicketingOrders } = require("@TicketingOrdersModel");
const { TicketingBookings } = require("@TicketingBookingsModel");
const { UserReservations } = require("@UserReservationsModel");
const MenuOrders = require("@OrdersModel");

/**
 * Ticketing Order Finalizer
 * - Source of truth: TicketingOrders
 * - Idempotent
 * - Transaction-safe
 */
const ticketingOrderFinalizerService = async ({ orderId, result }) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const order = await TicketingOrders.findById(orderId).session(session);
    if (!order) throw new Error("order_not_found");

    // 🛑 Idempotency guard (CRITICAL)
    if (order.status !== "pendingPayment") {
      await session.commitTransaction();
      return;
    }

    // ⏳ Gateway still pending → do nothing
    if (result.status === "pending") {
      await session.commitTransaction();
      return;
    }

    const reservation = await UserReservations
      .findOne({ ticketingOrderRef: orderId })
      .session(session);

    const menuOrderId = reservation?.preOrderMenuItemsOrder || null;

    // ==========================
    // ✅ PAYMENT SUCCESS
    // ==========================
    if (result.status === "paid") {
      await TicketingOrders.updateOne(
        { _id: orderId },
        {
          $set: {
            status: "paid",
            "paymentDetails.paymentStatus": "paid",
            "paymentDetails.paymentId": result.paymentId,
          },
        },
        { session }
      );

      await TicketingBookings.updateMany(
        { order: orderId },
        { $set: { status: "valid" } },
        { session }
      );

      if (reservation) {
        await UserReservations.updateOne(
          { _id: reservation._id },
          {
            $set: {
              status: "confirmed",
              "paymentDetails.paymentStatus": "paid",
              "paymentDetails.paymentId": result.paymentId,
              paidAt: new Date(),
            },
          },
          { session }
        );
      }

      if (menuOrderId) {
        await MenuOrders.updateOne(
          { _id: menuOrderId },
          {
            $set: {
              status: "confirmed",
              paymentStatus: "paid",
              paidAt: new Date(),
              transactionId: result.paymentId,
            },
          },
          { session }
        );
      }
    }

    // ==========================
    // ❌ PAYMENT FAILED
    // ==========================
    if (result.status === "failed") {
      await TicketingOrders.updateOne(
        { _id: orderId },
        {
          $set: {
            status: "cancelled",
            "paymentDetails.paymentStatus": "failed",
          },
        },
        { session }
      );

      await TicketingBookings.updateMany(
        { order: orderId },
        { $set: { status: "cancelled" } },
        { session }
      );

      if (reservation) {
        await UserReservations.updateOne(
          { _id: reservation._id },
          {
            $set: {
              status: "cancelled",
              "paymentDetails.paymentStatus": "failed",
            },
          },
          { session }
        );
      }

      if (menuOrderId) {
        await MenuOrders.updateOne(
          { _id: menuOrderId },
          {
            $set: {
              status: "cancelled",
              paymentStatus: "failed",
            },
          },
          { session }
        );
      }
    }

    await session.commitTransaction();
  } catch (err) {
    // ✅ Abort only if still active
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    throw err;
  } finally {
    session.endSession();
  }
};

module.exports = { ticketingOrderFinalizerService };
