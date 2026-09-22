const mongoose = require("mongoose");
const MenuOrders = require("@OrdersModel");
const { calculatePointsRepo } = require("../../../../app/loyalty/calculatePointsEarning/pointsEarningsRepository");
const {
  createTransactionService,
} = require("../../../../app/userWalletService/transactions/services/unifiedTransactionsService");

const {
  emitNewOrder,
  emitMenuOrderPaymentSockets,
} = require("@socketIo/orders/orderSocketEmitter");
const {
  menuItemOrderFormatter,
} = require("../../../../app/menuItemsAndOrdering/orders/formatter/menuItemOrderFormatter");
const { findAppUserByIdWithProjectionService } = require("../../../../app/usersManagement/usersService");
const {
  sendMenuOrderNotification,
} = require("../../../../controllers/notificationHelper/menuOrderNotificationService");
const { fireAndForget } = require("../../../../helperUtils/responseUtil");
const { syncMonriTransactionStatus } = require("../../monri/monriRepository");

const { handleLoyaltyEarningConsequences } = require("./handleLoyaltyEarningConsequences");
const triggerBadgeEngine = require("@triggerGlobalStreak");
const {
  recordPaidCaptureLedger,
} = require("../../ledger/ledgerWriter");

const menuOrderFinalizerService = async ({ menuOrderId, result }) => {
  const session = await mongoose.startSession();

  let committed = false;
  let menuOrder = null;
  let companyOrganizer = null;
  let companyPoints = null;
  let globalPoints = null;

  try {
    session.startTransaction();

    if (result.status === "pending") {
      await session.commitTransaction();
      return;
    }

    /* ==========================
       1️⃣ Load Menu Order
    ========================== */

    menuOrder = await MenuOrders.findById(menuOrderId)
      .populate({
        path: "organization",
        select: "creator",
      })
      .session(session);

    if (!menuOrder) {
      throw new Error("menu_order_not_found");
    }

    /* ==========================
       ⛔ Idempotency Guard
    ========================== */
    if (menuOrder.paymentStatus === "paid") {
      await session.commitTransaction();
      return;
    }

    companyOrganizer = menuOrder.organization?.creator;

    /* ==========================
       ✅ PAYMENT SUCCESS
    ========================== */
    if (result.status === "paid") {
      menuOrder.status = "confirmed";
      menuOrder.paymentStatus = "paid";
      menuOrder.paidAt = new Date();
      menuOrder.transactionId = result.transactionId || null;

      await menuOrder.save({ session });
      await syncMonriTransactionStatus(menuOrderId, "paid", {
        ...(result.transactionId && { monriTransactionId: String(result.transactionId) }),
      }).catch((err) => console.error("[monri-sync] menu paid:", err.message));

      const totalPrice = menuOrder.totalPrice || 0;

      if (totalPrice > 0) {
        try {
          const pointsCalculation = await calculatePointsRepo(menuOrder.user, companyOrganizer, totalPrice);

          companyPoints = {
            base: pointsCalculation.organizer.earnedPoints,
            multiplier: pointsCalculation.organizer.organizerMultiplier || 1,
            total: pointsCalculation.organizer.earnedPoints,
            pointsPerEuro: pointsCalculation.organizer.pointsPerEuro,
          };

          globalPoints = {
            base: pointsCalculation.global.earnedPoints,
            multiplier: pointsCalculation.global.globalMultiplier || 1,
            total: pointsCalculation.global.earnedPoints,
            pointsPerEuro: pointsCalculation.global.pointsPerEuro,
          };

          const trx = await createTransactionService(
            {
              user: menuOrder.user,
              companyOrganizer,
              organization: menuOrder.organization._id,
              companyPoints,
              globalPoints,
              allowNegative: false,
              type: "earn",
              description: "Menu order payment",
              entityId: menuOrder._id,
              domainType: "menuorders",
            },
            session,
          );

          if (!trx.success) {
            console.error("[LOYALTY] Menu points failed, continuing paid fulfill:", trx.message);
          }
        } catch (loyaltyErr) {
          console.error("[LOYALTY] Menu points threw, continuing paid fulfill:", loyaltyErr);
        }
      }
    }

    /* ==========================
       ❌ PAYMENT FAILED
    ========================== */
    if (result.status === "failed") {
      menuOrder.status = "cancelled";
      menuOrder.paymentStatus = "failed";
      await menuOrder.save({ session });
      await syncMonriTransactionStatus(menuOrderId, "failed").catch((err) =>
        console.error("[monri-sync] menu failed:", err.message),
      );
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

  /* =====================================================
   🚀 POST-COMMIT SIDE EFFECTS (OUTSIDE TRANSACTION)
===================================================== */
  if (committed && menuOrder) {
    /**
     * 📡 Sockets first so UI updates even if FCM/email later fails.
     * ORDER_UPDATE is immediate; NEW_ORDER follows with formatted user payload.
     */
    emitMenuOrderPaymentSockets(menuOrder, result.status, { includeNewOrder: false });
    if (result.status === "paid") {
      findAppUserByIdWithProjectionService(menuOrder.user, {
        profileIcon: 1,
        firstName: 1,
        lastName: 1,
        email: 1,
        username: 1,
        timezone: 1,
      })
        .then((userDetails) => {
          let formattedOrder = menuItemOrderFormatter(menuOrder, userDetails.timezone);

          formattedOrder.user = userDetails;
          formattedOrder.organization =
            menuOrder.organization?._id || menuOrder.organization;

          emitNewOrder(menuOrder, formattedOrder);
        })
        .catch((err) => console.error("Order emit failed:", err));
    }

    if (result.status === "paid") {
      // ordering_confirmation deferred until status=completed AND paid (fiscalTiming)
      fireAndForget(
        recordPaidCaptureLedger({
          orderId: menuOrder._id,
          orderType: "menuorders",
          module: "ORDERING",
          organization: menuOrder.organization?._id || menuOrder.organization,
          companyOrganizer,
          user: menuOrder.user,
          amount: menuOrder.totalPrice,
          tipAmount: menuOrder.priceBreakdown?.tip || 0,
          paymentStatus: "paid",
          paymentMethod: menuOrder.paymentMethod,
          providerTransactionId: result.transactionId || menuOrder.transactionId,
        }),
        "LEDGER_ORDERING_CAPTURE",
      );
    }
    if (menuOrder.totalPrice && menuOrder.totalPrice > 0) {
      fireAndForget(
        triggerBadgeEngine(menuOrder.user, {
          category: "singlePurchase",
          amount: menuOrder.totalPrice,
        }),
        "TRIGGER_BADGE_ENGINE",
      );
    }

    if (result.status === "paid") {
      try {
        handleLoyaltyEarningConsequences({
          userId: menuOrder.user,
          companyOrganizer,
          companyPoints,
          globalPoints,
          menuOrder,
        });
      } catch (err) {
        console.error("[LOYALTY] Menu side effect failed:", err);
      }
    }

    if (result.status === "paid") {
      fireAndForget(
        sendMenuOrderNotification({
          orderId: menuOrder._id,
          action: "MENU_ORDER_CONFIRMED",
        }),
        "MENU_ORDER_CONFIRMED_NOTIFICATION",
      );
    }

    if (result.status === "failed") {
      fireAndForget(
        sendMenuOrderNotification({
          orderId: menuOrder._id,
          action: "MENU_ORDER_CANCELLED",
        }),
        "MENU_ORDER_CANCELLED_NOTIFICATION",
      );
    }
  }
};

module.exports = { menuOrderFinalizerService };
