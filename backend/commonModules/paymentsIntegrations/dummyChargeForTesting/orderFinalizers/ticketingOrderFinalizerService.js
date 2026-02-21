const mongoose = require("mongoose");
const { TicketingOrders } = require("@TicketingOrdersModel");
const { TicketingBookings } = require("@TicketingBookingsModel");
const { UserReservations } = require("@UserReservationsModel");
const MenuOrders = require("@OrdersModel");
const { calculatePointsRepo } = require("../../../../app/loyalty/calculatePointsEarning/pointsEarningsRepository");
const { createTransactionService } = require("../../../../app/userWalletService/transactions/services/unifiedTransactionsService");
const { handleLoyaltyEarningConsequences } = require("./handleLoyaltyEarningConsequences");

/**
 * Ticketing Order Finalizer
 * - Source of truth: TicketingOrders
 * - Idempotent
 * - Transaction-safe
 */
const ticketingOrderFinalizerService = async ({ orderId, result }) => {
  const session = await mongoose.startSession();

  let committed = false;
  let order = null;
  let menuOrder = null;
  let companyPoints = null;
  let globalPoints = null;

  try {
    session.startTransaction();

    // ⛔ Ignore "pending" gateway status
    if (result.status === "pending") {
      await session.commitTransaction();
      return;
    }

    // =====================================================
    // 🔐 ATOMIC IDEMPOTENT STATE TRANSITION (CRITICAL FIX)
    // =====================================================
    order = await TicketingOrders.findOneAndUpdate(
      {
        _id: orderId,
        status: "pendingPayment", // ensures only one webhook wins
      },
      {
        $set: {
          status: result.status === "paid" ? "paid" : "cancelled",
          "paymentDetails.paymentStatus": result.status,
          "paymentDetails.paymentId": result.paymentId || null,
        },
      },
      {
        new: true,
        session,
      }
    );

    // If null → already processed by another webhook
    if (!order) {
      await session.commitTransaction();
      return;
    }

    // Fetch related reservation
    const userReservation = await UserReservations
      .findOne({ ticketingOrderRef: orderId })
      .populate("preOrderMenuItemsOrder")
      .session(session);

    menuOrder = userReservation?.preOrderMenuItemsOrder || null;

    // =====================================================
    // ✅ PAYMENT SUCCESS
    // =====================================================
    if (result.status === "paid") {

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

      // 🎯 Calculate loyalty points
      const pointsCalculation = await calculatePointsRepo(
        order.user,
        order.companyOrganizer,
        order.orderPricing.total
      );

      globalPoints = {
        base: pointsCalculation.global.earnedPoints,
        multiplier: pointsCalculation.global.globalMultiplier || 1,
        total: pointsCalculation.global.earnedPoints,
        pointsPerEuro: pointsCalculation.global.pointsPerEuro,
      };

      companyPoints = {
        base: pointsCalculation.organizer.earnedPoints,
        multiplier: pointsCalculation.organizer.organizerMultiplier || 1,
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

      const trx = await createTransactionService(trxData, session);

      if (!trx.success) {
        console.error("Transaction creation failed:", trx);
        throw new Error(trx.message || "wallet_update_failed");
      }
    }

    // =====================================================
    // ❌ PAYMENT FAILED
    // =====================================================
    if (result.status === "failed") {

      await TicketingBookings.updateMany(
        { order: orderId },
        { $set: { status: "cancelled" } },
        { session }
      );

      if (userReservation) {
        await UserReservations.updateOne(
          { _id: userReservation._id },
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
    committed = true;

  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    throw err;
  } finally {
    session.endSession();
  }
  // =====================================================
  // 🚀 POST-COMMIT SIDE EFFECTS (OUTSIDE TRANSACTION)
  // =====================================================
  if (committed) {

    handleLoyaltyEarningConsequences({
      userId: order.user,
      companyOrganizer: order.companyOrganizer,
      companyPoints,
      globalPoints,
      menuOrder: order
    });

  }

};


module.exports = { ticketingOrderFinalizerService };
