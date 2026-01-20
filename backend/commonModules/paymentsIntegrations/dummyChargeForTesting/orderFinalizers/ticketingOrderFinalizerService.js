const mongoose = require("mongoose");
const { TicketingOrders } = require("@TicketingOrdersModel");
const { TicketingBookings } = require("@TicketingBookingsModel");
const { UserReservations } = require("@UserReservationsModel");
const MenuOrders = require("@OrdersModel");
const { calculatePointsRepo } = require("../../../../app/loyalty/calculatePointsEarning/pointsEarningsRepository");
const { createTransaction } = require("../../../../app/userWalletService/transactions/services/unifiedTransactionsService");
const { resolveChallengeByTaskTypeService } = require("../../../../app/loyalty/challengesOrders/challengeOrdersService");

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
    // if (order.status !== "pendingPayment") {
    //   await session.commitTransaction();
    //   return;
    // }

    // ⏳ Gateway still pending → do nothing
    if (result.status === "pending") {
      await session.commitTransaction();
      return;
    }

    const userReservation = await UserReservations
      .findOne({ ticketingOrderRef: orderId })
      .populate("preOrderMenuItemsOrder")
      .session(session);

    const menuOrder = userReservation?.preOrderMenuItemsOrder || null;

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

      if (userReservation) {
        await UserReservations.updateOne(
          { _id: userReservation._id },
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

      if (menuOrder) {
        await MenuOrders.updateOne(
          { _id: menuOrder._id },
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

      /* 
      when everything is successful, give points to user
      Loyalty points */
      const pointsCalculation =
        await calculatePointsRepo(order.user, order.companyOrganizer, order.orderPricing.total);

      const globalPoints = {
        base: pointsCalculation.global.earnedPoints,
        multiplier: 1,
        total: pointsCalculation.global.earnedPoints,
        pointsPerEuro: pointsCalculation.global.pointsPerEuro,
      };

      const companyPoints = {
        base: pointsCalculation.organizer.earnedPoints,
        multiplier: 1,
        total: pointsCalculation.organizer.earnedPoints,
        pointsPerEuro: pointsCalculation.organizer.pointsPerEuro,
      };


      const trxData = {
        user: order.user,
        companyOrganizer: order.companyOrganizer,
        organization: order.organization,
        companyPoints,
        globalPoints,
        allowNegative: false,
        type: "earn",
        description: "Booked tickets.",
        entityId: order._id,
        domainType: "ticketingorders",
      };

      const trx = await createTransaction(trxData, session);

      if (!trx.success) throw new Error(trx.message || "wallet_update_failed");

      if (menuOrder) {
        var items = menuOrder.items.map(i => i.menuItem);
        if (items.length > 0) {
          try {
            await resolveChallengeByTaskTypeService({
              userId: userReservation.userId,
              companyOrganizer: userReservation.companyOrganizer,
              taskType: "buyMenuItem",
              items: items
            });
          } catch (err) {

          }
        }
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

      if (menuOrder) {
        await MenuOrders.updateOne(
          { _id: menuOrder._id },
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
