const mongoose = require("mongoose");
const MenuOrders = require("@OrdersModel");
const {
  calculatePointsRepo,
} = require("../../../../app/loyalty/calculatePointsEarning/pointsEarningsRepository");
const {
  createTransactionService,
} = require("../../../../app/userWalletService/transactions/services/unifiedTransactionsService");

const { emitOrderEvent } = require("@socketIo/orders/orderSocketEmitter");
const { menuItemOrderFormatter } = require("../../../../app/menuItemsAndOrdering/orders/formatter/menuItemOrderFormatter");
const { findAppUserByIdWithProjectionService } = require("../../../../app/usersManagement/usersService");

const { handleLoyaltyEarningConsequences } = require("./handleLoyaltyEarningConsequences");

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
      menuOrder.transactionId = result.paymentId || null;

      await menuOrder.save({ session });

      const totalPrice = menuOrder.totalPrice || 0;

      if (totalPrice > 0) {
        const pointsCalculation = await calculatePointsRepo(
          menuOrder.user,
          companyOrganizer,
          totalPrice
        );

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
          session
        );

        if (!trx.success) {
          throw new Error(trx.message || "failed_loyalty_update");
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
  if (committed && result.status === "paid") {

    handleLoyaltyEarningConsequences({
      userId: menuOrder.user,
      companyOrganizer,
      companyPoints,
      globalPoints,
      menuOrder
    });

    // 🔔 Emit Order Event
    findAppUserByIdWithProjectionService(
      menuOrder.user,
      {
        profileIcon: 1,
        firstName: 1,
        lastName: 1,
        email: 1,
        username: 1,
        timezone: 1,
      }
    )
      .then(userDetails => {
        let formattedOrder = menuItemOrderFormatter(
          menuOrder,
          userDetails.timezone
        );

        formattedOrder.user = userDetails;
        formattedOrder.organization = menuOrder.organization._id;

        emitOrderEvent({
          io: global.io,
          eventName: "NEW_ORDER",
          orderId: menuOrder._id,
          organizationId: menuOrder.organization._id,
          data: formattedOrder,
        });
      })
      .catch(err =>
        console.error("Order emit failed:", err)
      );
  }
};



module.exports = { menuOrderFinalizerService };
