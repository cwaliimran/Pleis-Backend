const mongoose = require("mongoose");
const { TicketingBookings } = require("@TicketingBookingsModel");
const { calculatePointsRepo } = require("../../../../app/loyalty/calculatePointsEarning/pointsEarningsRepository");
const { createTransaction } = require("../../../../app/userWalletService/transactions/services/unifiedTransactionsService");

const ticketingTransferFinalizerService = async ({
  bookingId,
  userId,
  newUserId,
  result,
}) => {
  console.log(
    "[TicketTransferFinalizer] start booking:",
    bookingId,
    "from:",
    userId,
    "to:",
    newUserId,
    "status:",
    result.status
  );

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const booking = await TicketingBookings
      .findById(bookingId)
      .session(session);

    if (!booking) {
      console.log("[TicketTransferFinalizer] booking not found");
      throw new Error("ticketing_booking_not_found");
    }

    console.log(
      "[TicketTransferFinalizer] booking loaded, current owner:",
      booking.user.toString()
    );

    // Gateway pending → do nothing
    if (result.status === "pending") {

      await session.commitTransaction();
      return;
    }

    // Idempotency guard
    if (booking.user.toString() === newUserId.toString()) {
      console.log("[TicketTransferFinalizer] already transferred, skipping");
      await session.commitTransaction();
      return;
    }

    /* ==========================
       ✅ PAYMENT SUCCESS
    ========================== */
    if (result.status === "paid") {
      console.log("[TicketTransferFinalizer] payment success");

      if (booking.user.toString() !== userId.toString()) {
        console.log("[TicketTransferFinalizer] unauthorized transfer");
        throw new Error("unauthorized_transfer_attempt");
      }

      // Transfer ownership
      booking.user = newUserId;

      booking.transferHistory.push({
        fromUser: userId,
        toUser: newUserId,
        transferDate: new Date(),
        paymentId: result.paymentId || null,
      });

      await booking.save({ session });

      console.log("[TicketTransferFinalizer] ownership transferred");

      /* ---------- GLOBAL POINTS ONLY ---------- */
      const amount = result.amount ?? 0;

      console.log(
        "[TicketTransferFinalizer] transfer amount:",
        amount,
        "organizer:",
        booking.companyOrganizer
      );

      if (amount > 0 && booking.companyOrganizer) {
        console.log("[TicketTransferFinalizer] calculating global points");

        const pointsCalculation = await calculatePointsRepo(
          userId,
          booking.companyOrganizer,
          amount
        );

        const globalPoints = {
          base: pointsCalculation.global.earnedPoints,
          multiplier: 1,
          total: pointsCalculation.global.earnedPoints,
          pointsPerEuro: pointsCalculation.global.pointsPerEuro,
        };

        console.log(
          "[TicketTransferFinalizer] global points earned:",
          globalPoints.total
        );

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

          console.log(
            "[TicketTransferFinalizer] issuing global points transaction"
          );

          const trx = await createTransaction(trxData, session);

          if (!trx.success) {
            console.log(
              "[TicketTransferFinalizer] wallet update failed"
            );
            throw new Error(trx.message || "wallet_update_failed");
          }

          console.log(
            "[TicketTransferFinalizer] global points issued successfully"
          );
        } else {
          console.log(
            "[TicketTransferFinalizer] no global points earned"
          );
        }
      } else {
        console.log(
          "[TicketTransferFinalizer] points skipped (amount or organizer missing)"
        );
      }
    }

    /* ==========================
       ❌ PAYMENT FAILED
    ========================== */
    if (result.status === "failed") {
      console.log("[TicketTransferFinalizer] payment failed, no changes");
    }

    await session.commitTransaction();
    console.log("[TicketTransferFinalizer] transaction committed");
  } catch (err) {
    console.error("[TicketTransferFinalizer] error:", err.message);

    if (session.inTransaction()) {
      await session.abortTransaction();
      console.log("[TicketTransferFinalizer] transaction aborted");
    }

    throw err;
  } finally {
    session.endSession();
    console.log("[TicketTransferFinalizer] session ended");
  }
};

module.exports = { ticketingTransferFinalizerService };
