const mongoose = require("mongoose");
const { UserReservations } = require("@UserReservationsModel");
const MenuOrders = require("@OrdersModel");
const { calculatePointsRepo } = require("../../../../app/loyalty/calculatePointsEarning/pointsEarningsRepository");
const {
  createTransactionService,
} = require("../../../../app/userWalletService/transactions/services/unifiedTransactionsService");
const { handleLoyaltyEarningConsequences } = require("./handleLoyaltyEarningConsequences");
const {
  sendReservationNotification,
} = require("../../../../controllers/notificationHelper/reservationNotificationService");
const {
  sendMenuOrderNotification,
} = require("../../../../controllers/notificationHelper/menuOrderNotificationService");
const { fireAndForget } = require("../../../../helperUtils/responseUtil");
const { getUserReservationDetails } = require("../../../../app/reservations/reservationRepository");
const { userReservationsFormatter } = require("../../../../app/reservations/formaters/reservationFormetter");
const {
  reservationConfirmationEmailTemplate,
  reservationCancelledEmailTemplate,
} = require("../../../../helperUtils/emailTemplates/userReservationsTemplates");
const { sendEmailViaMailgun } = require("../../../../helperUtils/emailUtil");
const { findAppUserByIdWithProjectionService } = require("../../../../app/usersManagement/usersService");
const triggerBadgeEngine = require("@triggerGlobalStreak");
const reservationOrderFinalizerService = async ({ reservationId, result }) => {
  const session = await mongoose.startSession();

  let committed = false;
  let userReservation = null;
  let menuOrder = null;
  let companyPoints = null;
  let globalPoints = null;

  try {
    session.startTransaction();

    if (result.status === "pending") {
      await session.commitTransaction();
      return;
    }

    userReservation = await UserReservations.findById(reservationId)
      .populate("preOrderMenuItemsOrder")
      .session(session);

    if (!userReservation) {
      console.error("[reservationOrderFinalizerService] Reservation not found:", reservationId);
      throw new Error("reservation_not_found");
    }

    menuOrder = userReservation.preOrderMenuItemsOrder;

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
            "paymentDetails.transactionId": result.transactionId,
            paidAt: new Date(),
            "voucher.discountAmount": userReservation?.priceBreakDown?.reservationAmount || 0,
            "voucher.status": "pending",
          },
          $push: {
            reservationChanges: {
              changedBy: null,
              action: "paymentStatusChanged",
              oldValue: userReservation.paymentDetails?.paymentStatus || "pending",
              newValue: "paid",
              reason: "Payment status updated by system",
              createdAt: new Date(),
            },
          },
        },
        { session },
      );

      if (menuOrder) {
        await MenuOrders.updateOne(
          { _id: menuOrder._id },
          {
            $set: {
              status: "confirmed",
              paymentStatus: "paid",
              paidAt: new Date(),
              transactionId: result.transactionId,
            },
          },
          { session },
        );
      }

      try {
        const reservationDetails = await getUserReservationDetails(userReservation._id);

        let userDetails = await findAppUserByIdWithProjectionService(userReservation.userId, {
          timezone: 1,
          email: 1,
          username: 1,
        });

        const formatted = userReservationsFormatter(reservationDetails, userDetails.timezone || "UTC");

        const html = reservationConfirmationEmailTemplate({
          userName: formatted.userName,
          reservation: formatted,
          organizationName: formatted.organizationName,
          currency: "EUR",
        });


        sendEmailViaMailgun(userDetails.email, "Your reservation is confirmed", html);
      } catch (err) {
        console.error("[reservationOrderFinalizerService] Reservation confirmation email failed:", err);
      }

      const totalPrice = userReservation.amount || 0;

      let bonusPoints = userReservation?.reservationSnapshot?.bonusPoints ?? 0;

      const pointsCalculation = await calculatePointsRepo(
        userReservation.userId,
        userReservation.companyOrganizer,
        totalPrice,
      );

      companyPoints = {
        base: pointsCalculation.organizer.earnedPoints,
        multiplier: pointsCalculation.organizer.organizerMultiplier || 1,
        total: pointsCalculation.organizer.earnedPoints + bonusPoints,
        pointsPerEuro: pointsCalculation.organizer.pointsPerEuro,
        bonusPoints,
      };

      globalPoints = {
        base: pointsCalculation.global.earnedPoints,
        multiplier: pointsCalculation.global.globalMultiplier || 1,
        total: pointsCalculation.global.earnedPoints + bonusPoints,
        pointsPerEuro: pointsCalculation.global.pointsPerEuro,
        bonusPoints,
      };

      const trx = await createTransactionService(
        {
          user: userReservation.userId,
          companyOrganizer: userReservation.companyOrganizer,
          organization: userReservation.organizationId,
          companyPoints,
          globalPoints,
          allowNegative: false,
          type: "earn",
          description: "",
          entityId: userReservation._id,
          domainType: "userreservations",
        },
        session,
      );

      if (!trx.success) {
        console.error("[reservationOrderFinalizerService] Loyalty transaction failed:", trx.message);
        throw new Error(trx.message || "failed_loyalty_update");
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
        { session },
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
          { session },
        );
      }
    }

    await session.commitTransaction();

    if (result.status === "failed") {
      const reservationDetails = await getUserReservationDetails(userReservation._id);

      let userDetails = await findAppUserByIdWithProjectionService(userReservation.userId, {
        timezone: 1,
        email: 1,
        username: 1,
      });

      const formatted = userReservationsFormatter(reservationDetails, userDetails.timezone || "UTC");

      const html = reservationCancelledEmailTemplate({
        userName: formatted.userName,
        reservation: formatted,
        organizationName: formatted.organizationName,
      });

      await sendEmailViaMailgun(userDetails.email, "Reservation payment failed", html);
    }

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
  // 🚀 POST-COMMIT SIDE EFFECTS
  // =====================================================
  if (committed && userReservation) {
  

    if (userReservation.amount && userReservation.amount > 0) {
      fireAndForget(
        triggerBadgeEngine(userReservation.userId, {
          category: "singlePurchase",
          amount: userReservation.amount,
        }),
        "TRIGGER_BADGE_ENGINE",
      );
    }

    /**
     * =====================================================
     * 🎯 Loyalty Side Effects (Only on Paid)
     * =====================================================
     */
    if (result.status === "paid") {
      try {
  
        handleLoyaltyEarningConsequences({
          userId: userReservation.userId,
          companyOrganizer: userReservation.companyOrganizer,
          companyPoints,
          globalPoints,
          menuOrder: menuOrder,
        });
      } catch (err) {
        console.error("[LOYALTY] Reservation side effect failed:", err);
      }
    }

    /**
     * =====================================================
     * 🔔 Reservation Notifications
     * =====================================================
     */
    if (result.status === "paid") {
     
      fireAndForget(
        sendReservationNotification({
          reservationId: userReservation._id,
          action: "RESERVATION_CONFIRMED",
        }),
        "RESERVATION_CONFIRMED_NOTIFICATION",
      );
    }

    if (result.status === "failed") {

      fireAndForget(
        sendReservationNotification({
          reservationId: userReservation._id,
          action: "RESERVATION_CANCELLED",
        }),
        "RESERVATION_CANCELLED_NOTIFICATION",
      );
    }

    /**
     * =====================================================
     * 🟡 If Reservation Has Pre-Order Menu
     * =====================================================
     */
    if (menuOrder) {
      if (result.status === "paid") {

        fireAndForget(
          sendMenuOrderNotification({
            orderId: menuOrder._id,
            action: "MENU_ORDER_CONFIRMED",
          }),
          "RESERVATION_MENU_CONFIRMED_NOTIFICATION",
        );
      }

      if (result.status === "failed") {
       
        fireAndForget(
          sendMenuOrderNotification({
            orderId: menuOrder._id,
            action: "MENU_ORDER_CANCELLED",
          }),
          "RESERVATION_MENU_CANCELLED_NOTIFICATION",
        );
      }
    }
  }
};

module.exports = { reservationOrderFinalizerService };
