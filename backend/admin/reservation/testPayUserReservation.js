const { UserReservations } = require("@UserReservationsModel");
const {
  reservationOrderFinalizerService,
} = require("../../commonModules/paymentsIntegrations/dummyChargeForTesting/orderFinalizers/reservationOrderFinalizerService");
const {
  sendResponse,
  validateParams,
} = require("../../helperUtils/responseUtil");
const {
  isMinSpendReservation,
} = require("../../commonModules/fiscalDocuments/fiscalTiming");

async function testPayUserReservation(req, res) {
  try {
    if (
      !validateParams(req, res, {
        pathParams: ["id"],
        objectIdFields: ["id"],
      })
    ) {
      return;
    }

    const reservation = await UserReservations.findById(req.params.id).select(
      "status paymentDetails preOrderMenuItemsOrder amount reservationSnapshot",
    );
    if (!reservation) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "reservation_not_found",
      });
    }

    const alreadyPaid = reservation.paymentDetails?.paymentStatus === "paid";
    const fiscalNote = isMinSpendReservation(reservation)
      ? "min-spend reservation_confirmation enqueues on first voucher use"
      : "free / non-min-spend reservations never enqueue reservation_confirmation";

    if (alreadyPaid) {
      return sendResponse({
        res,
        statusCode: 200,
        translationKey: "reservation_already_paid",
        data: {
          reservationId: String(reservation._id),
          status: reservation.status,
          paymentStatus: reservation.paymentDetails?.paymentStatus,
          fiscalJobs: [],
          note: fiscalNote,
        },
      });
    }

    const awaitingPayment =
      reservation.status === "pendingPayment" ||
      (reservation.paymentDetails?.paymentStatus === "pending" &&
        Number(reservation.amount || 0) > 0);

    if (!awaitingPayment) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "reservation_not_pending_payment",
        data: {
          status: reservation.status,
          paymentStatus: reservation.paymentDetails?.paymentStatus,
        },
      });
    }

    const transactionId = `ADMIN_TEST_${Date.now()}`;
    await reservationOrderFinalizerService({
      reservationId: reservation._id,
      result: {
        status: "paid",
        transactionId,
      },
    });

    const updated = await UserReservations.findById(reservation._id)
      .select("status paymentDetails amount preOrderMenuItemsOrder reservationSnapshot")
      .lean();

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "reservation_marked_paid_for_test",
      data: {
        reservationId: String(reservation._id),
        transactionId,
        status: updated?.status,
        paymentStatus: updated?.paymentDetails?.paymentStatus,
        fiscalJobs: [],
        note: isMinSpendReservation(updated)
          ? "min-spend reservation_confirmation enqueues on first voucher use"
          : "free / non-min-spend reservations never enqueue reservation_confirmation",
      },
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server_error",
      error,
    });
  }
}

module.exports = { testPayUserReservation };
