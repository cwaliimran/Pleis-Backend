const mongoose = require("mongoose");
const { TicketingBookings } = require("@TicketingBookingsModel");
const { calculatePointsRepo } = require("../../../../app/loyalty/calculatePointsEarning/pointsEarningsRepository");
const { createTransactionService } = require("../../../../app/userWalletService/transactions/services/unifiedTransactionsService");
const { handleLoyaltyEarningConsequences } = require("./handleLoyaltyEarningConsequences");

const ticketingTransferFinalizerService = async ({
  bookingId,
  userId,
  newUserId,
  result,
}) => {

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const booking = await TicketingBookings
      .findById(bookingId)
      .session(session);

    if (!booking) {
      throw new Error("ticketing_booking_not_found");
    }
    let globalPoints = null;

    // Gateway pending → do nothing
    if (result.status === "pending") {

      await session.commitTransaction();
      return;
    }

    // Idempotency guard
    if (booking.user.toString() === newUserId.toString()) {
      await session.commitTransaction();
      return;
    }

    /* ==========================
       ✅ PAYMENT SUCCESS
    ========================== */
    if (result.status === "paid") {

      if (booking.user.toString() !== userId.toString()) {
        throw new Error("unauthorized_transfer_attempt");
      }

      // Transfer ownership
      booking.user = newUserId;

      booking.transferHistory.push({
        fromUser: userId,
        toUser: newUserId,
        transferDate: new Date(),
        transactionId: result.transactionId || null,
      });

      await booking.save({ session });


      /* ---------- GLOBAL POINTS ONLY ---------- */
      const amount = result.amount ?? 0;


      if (amount > 0 && booking.companyOrganizer) {

        const pointsCalculation = await calculatePointsRepo(
          userId,
          booking.companyOrganizer,
          amount
        );

        globalPoints = {
          base: pointsCalculation.global.earnedPoints,
          multiplier: pointsCalculation.global.globalMultiplier || 1,
          total: pointsCalculation.global.earnedPoints,
          pointsPerEuro: pointsCalculation.global.pointsPerEuro,
        };


        if (globalPoints.total > 0) {
          const trxData = {
            user: userId,
            organization: booking.organization,
            globalPoints,
            allowNegative: false,
            type: "earn",
            description: "Ticket transfer payment.",
            entityId: booking._id,
            domainType: "ticketingbookings",
          };


          const trx = await createTransactionService(trxData, session);

          if (!trx.success) {
            throw new Error(trx.message || "wallet_update_failed");
          }

        } else {
        }
      } else {
      }
    }

    /* ==========================
       ❌ PAYMENT FAILED
    ========================== */
    if (result.status === "failed") {
    }

    await session.commitTransaction();

    if (globalPoints && globalPoints?.total > 0) {
      handleLoyaltyEarningConsequences({
        userId,
        globalPoints,
      });

    }


  } catch (err) {
    console.error("[TicketTransferFinalizer] error:", err.message);

    if (session.inTransaction()) {
      await session.abortTransaction();
    }

    throw err;
  } finally {
    session.endSession();
  }
};

module.exports = { ticketingTransferFinalizerService };
