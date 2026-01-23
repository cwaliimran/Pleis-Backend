const { UserReservations } = require("@UserReservationsModel");
const { attemptUserReservationOrderPayment } = require(
  "../../../commonModules/paymentsIntegrations/dummyChargeForTesting/paymentService"
);
const {
  reservationOrderFinalizerService,
} = require(
  "../../../commonModules/paymentsIntegrations/dummyChargeForTesting/orderFinalizers/reservationOrderFinalizerService"
);

/**
 * Reconcile pending reservation payments
 * - Source of truth: UserReservations
 */
const reconcilePendingUserReservationPayments = async () => {
  const reservations = await UserReservations.find({
    "paymentDetails.paymentStatus": "pending",
    status: "pending",
    ticketingOrderRef: null,
    lockUntil: { $lt: new Date() },
  });

  // console.log("🔄 Reconciling", reservations.length, "pending reservations...");

  for (const reservation of reservations) {
    try {
      const result = await attemptUserReservationOrderPayment(reservation._id);

      console.log(
        "reservationId==>",
        reservation._id.toString(),
        "status==>",
        result.status
      );

      await reservationOrderFinalizerService({
        reservationId: reservation._id,
        result,
      });
    } catch (err) {
      // IMPORTANT: do not crash the loop
      console.error(
        "❌ Reservation reconciliation failed",
        reservation._id.toString(),
        err.message
      );
    }
  }
};

module.exports = { reconcilePendingUserReservationPayments };
