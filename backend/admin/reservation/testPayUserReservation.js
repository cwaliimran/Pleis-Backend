const { UserReservations } = require("@UserReservationsModel");
const {
  reservationOrderFinalizerService,
} = require("../../commonModules/paymentsIntegrations/dummyChargeForTesting/orderFinalizers/reservationOrderFinalizerService");
const { enqueueFiscalDocument } = require("../../bullmq/queues");
const {
  sendResponse,
  validateParams,
} = require("../../helperUtils/responseUtil");

async function requeueReservationConfirmations(reservation) {
  const fiscalJobs = [`reservation_confirmation-${reservation._id}`];
  await enqueueFiscalDocument({
    kind: "reservation_confirmation",
    orderId: reservation._id,
  });

  const menuOrderId = reservation.preOrderMenuItemsOrder?._id || reservation.preOrderMenuItemsOrder;
  if (menuOrderId) {
    fiscalJobs.push(`ordering_confirmation-${menuOrderId}`);
    await enqueueFiscalDocument({
      kind: "ordering_confirmation",
      orderId: menuOrderId,
    });
  }

  return fiscalJobs;
}

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
      "status paymentDetails preOrderMenuItemsOrder amount",
    );
    if (!reservation) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "reservation_not_found",
      });
    }

    const alreadyPaid = reservation.paymentDetails?.paymentStatus === "paid";

    if (alreadyPaid) {
      const fiscalJobs = await requeueReservationConfirmations(reservation);
      return sendResponse({
        res,
        statusCode: 200,
        translationKey: "reservation_already_paid_fiscal_requeued",
        data: {
          reservationId: String(reservation._id),
          status: reservation.status,
          paymentStatus: reservation.paymentDetails?.paymentStatus,
          fiscalJobs,
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
      .select("status paymentDetails amount preOrderMenuItemsOrder")
      .lean();

    const menuOrderId =
      updated?.preOrderMenuItemsOrder?._id || updated?.preOrderMenuItemsOrder;
    const fiscalJobs = [`reservation_confirmation-${reservation._id}`];
    if (menuOrderId) {
      fiscalJobs.push(`ordering_confirmation-${menuOrderId}`);
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "reservation_marked_paid_for_test",
      data: {
        reservationId: String(reservation._id),
        transactionId,
        status: updated?.status,
        paymentStatus: updated?.paymentDetails?.paymentStatus,
        fiscalJobs,
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
