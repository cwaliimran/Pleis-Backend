const mongoose = require("mongoose");
const { UserReservations } = require("@UserReservationsModel");
const MenuOrders = require("@OrdersModel");
const { calculatePointsRepo } = require("../../../../app/loyalty/calculatePointsEarning/pointsEarningsRepository");
const { createTransaction } = require("../../../../app/userWalletService/transactions/services/unifiedTransactionsService");
const { resolveChallengeByTaskTypeService } = require("../../../../app/loyalty/challengesOrders/challengeOrdersService");

/**
 * Reservation Order Finalizer
 * - Source of truth: UserReservations
 * - Resolves linked MenuOrders (preOrderMenuItemsOrder)
 */
const reservationOrderFinalizerService = async ({ reservationId, result }) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userReservation = await UserReservations
      .findById(reservationId)
      .populate("preOrderMenuItemsOrder")
      .session(session);

    if (!userReservation) throw new Error("reservation_not_found");

    const menuOrder = userReservation.preOrderMenuItemsOrder;

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
      if (menuOrder) {
        await MenuOrders.updateOne(
          { _id: menuOrder._id },
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

      //create transaction and give loyalty points to user
      //totalPrice including menu items + reservation amount
      const totalPrice = userReservation.amount || 0;

      let bonusPoints =
        userReservation?.reservationSnapshot?.bonusPoints ?? 0;

      const pointsCalculation =
        await calculatePointsRepo(userReservation.userId, userReservation.companyOrganizer, totalPrice);

      const trx = await createTransaction(
        {
          user: userReservation.userId,
          companyOrganizer: userReservation.companyOrganizer,
          organization: userReservation.organizationId,
          companyPoints: {
            base: pointsCalculation.organizer.earnedPoints,
            multiplier: 1,
            total: (pointsCalculation.organizer.earnedPoints + bonusPoints),
            pointsPerEuro: pointsCalculation.organizer.pointsPerEuro,
            bonusPoints: bonusPoints,
          },
          globalPoints: {
            base: pointsCalculation.global.earnedPoints,
            multiplier: 1,
            total: (pointsCalculation.global.earnedPoints + bonusPoints),
            pointsPerEuro: pointsCalculation.global.pointsPerEuro,
            bonusPoints: bonusPoints,
          },
          allowNegative: false,
          type: "earn",
          description: "",
          entityId: userReservation._id,
          domainType: "userreservations",
        },
        session
      );

      if (!trx.success) {
        throw new Error(trx.message || "failed_loyalty_update");
      }

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
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

module.exports = { reservationOrderFinalizerService };
