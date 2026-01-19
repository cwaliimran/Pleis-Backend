const mongoose = require("mongoose");
const { UserReservations } = require("@UserReservationsModel");
const MenuOrders = require("@OrdersModel");

/**
 * Reservation Order Finalizer
 * - Source of truth: UserReservations
 * - Resolves linked MenuOrders (preOrderMenuItemsOrder)
 */
const reservationOrderFinalizerService = async ({ reservationId, result }) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const reservation = await UserReservations
      .findById(reservationId)
      .session(session);

    if (!reservation) throw new Error("reservation_not_found");

    const menuOrderId = reservation.preOrderMenuItemsOrder;

    // ==========================
    // ✅ PAYMENT SUCCESS
    // ==========================
    if (result.status === "paid") {
      await UserReservations.updateOne(
        { _id: reservationId },
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

      // 🔗 Resolve preorder menu order
      if (menuOrderId) {
        await MenuOrders.updateOne(
          { _id: menuOrderId },
          {
            $set: {
              status: "confirmed", // or keep "preorder" if you prefer
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
      await UserReservations.updateOne(
        { _id: reservationId },
        {
          $set: {
            status: "cancelled",
            "paymentDetails.paymentStatus": "failed",
          },
        },
        { session }
      );

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
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

module.exports = { reservationOrderFinalizerService };
