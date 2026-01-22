const mongoose = require("mongoose");
const MenuOrders = require("@OrdersModel");
const {
  calculatePointsRepo,
} = require("../../../../app/loyalty/calculatePointsEarning/pointsEarningsRepository");
const {
  createTransaction,
} = require("../../../../app/userWalletService/transactions/services/unifiedTransactionsService");
const {
  resolveChallengeByTaskTypeService,
} = require("../../../../app/loyalty/challengesOrders/challengeOrdersService");
const { emitOrderEvent } = require("@socketIo/orders/orderSocketEmitter");
const { menuItemOrderFormatter } = require("../../../../app/menuItemsAndOrdering/orders/formatter/menuItemOrderFormatter");
const { findAppUserByIdWithProjectionService } = require("../../../../app/usersManagement/usersService");

/**
 * Menu Order Payment Finalizer
 *
 * Source of truth: MenuOrders
 * Triggered by: payment webhook / reconciliation
 */
const menuOrderFinalizerService = async ({ menuOrderId, result }) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    /* ==========================
       1️⃣ Load Menu Order
    ========================== */
    const menuOrder = await MenuOrders.findById(menuOrderId)
      .populate({
        path: "organization",
        select: "creator", // required for loyalty
      })
      .session(session);

    if (!menuOrder) {
      throw new Error("menu_order_not_found");
    }

    const companyOrganizer = menuOrder.organization?.creator;

    /* ==========================
       ⛔ Idempotency Guard
    ========================== */
    if (menuOrder.paymentStatus === "paid") {
      await session.commitTransaction();
      return;
    }

    /* ==========================
       ✅ PAYMENT SUCCESS
    ========================== */
    if (result.status === "paid") {
      // ---- Update Menu Order ----
      menuOrder.status = "confirmed";
      menuOrder.paymentStatus = "paid";
      menuOrder.paidAt = new Date();
      menuOrder.transactionId = result.paymentId || null;

      await menuOrder.save({ session });

      /* ==========================
         🎯 Loyalty Points
      ========================== */
      const totalPrice = menuOrder.totalPrice || 0;

      if (totalPrice > 0) {
        const pointsCalculation = await calculatePointsRepo(
          menuOrder.user,
          companyOrganizer,
          totalPrice
        );

        const trx = await createTransaction(
          {
            user: menuOrder.user,
            companyOrganizer,
            organization: menuOrder.organization._id,
            companyPoints: {
              base: pointsCalculation.organizer.earnedPoints,
              multiplier: 1,
              total: pointsCalculation.organizer.earnedPoints,
              pointsPerEuro: pointsCalculation.organizer.pointsPerEuro,
            },
            globalPoints: {
              base: pointsCalculation.global.earnedPoints,
              multiplier: 1,
              total: pointsCalculation.global.earnedPoints,
              pointsPerEuro: pointsCalculation.global.pointsPerEuro,
            },
            allowNegative: false,
            type: "earn",
            description: "Menu order payment",
            entityId: menuOrder._id,
            domainType: "menuorders",
          },
          session
        );

        if (!trx.success) {
          throw new Error(trx.message || "failed_loyalty_update");
        }
      }

      /* ==========================
         🏆 Challenges
      ========================== */
      const items =
        menuOrder.items?.map((i) => i.menuItem) || [];
      if (items.length) {
        try {
          //TODO use this function also on admin side as well when they will complete the order for payLater method
          //resolveChallengeByTaskTypeService
          resolveChallengeByTaskTypeService({
            userId: menuOrder.user,
            companyOrganizer,
            taskType: "buyMenuItem",
            items,
          });
        } catch (_) {
          // challenge failure must NEVER break payment finalization
        }
      }


      let userDetails = await findAppUserByIdWithProjectionService(menuOrder.user, { profileIcon: 1, firstName: 1, lastName: 1, profileIcon: 1, email: 1, username: 1, timezone: 1 });
      let formattedOrder = menuItemOrderFormatter(menuOrder, userDetails.timezone);
      formattedOrder.user = userDetails;
      formattedOrder.organization = menuOrder.organization._id;
      emitOrderEvent({
        io: global.io,
        eventName: "NEW_ORDER",
        orderId: menuOrder._id,
        organizationId: menuOrder.organization._id,
        data: formattedOrder,
      });

    }

    /* ==========================
       ❌ PAYMENT FAILED
    ========================== */
    if (result.status === "failed") {
      menuOrder.status = "cancelled";
      menuOrder.paymentStatus = "failed";
      await menuOrder.save({ session });

      // emitOrderEvent({
      //   io: global.io,
      //   eventName: "ORDER_UPDATE",
      //   orderId: menuOrder._id,
      //   organizationId: menuOrder.organization._id,
      //   data: {
      //     status: menuOrder.status,
      //     paymentStatus: menuOrder.paymentStatus,
      //   },
      // });
    }

    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

module.exports = { menuOrderFinalizerService };
