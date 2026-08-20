const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const OrdersRepo = require("./inAppOrderingRepository");
const { NotificationTypes } = require("@NotificationsModel");
const mongoose = require("mongoose");
const Menus = require("@MenusModel");
const { emitOrderEvent } = require("@socketIo/orders/orderSocketEmitter");
const { sendUserNotifications } = require("../../../controllers/communicationController");
const { calculatePointsRepo } = require("../../../app/loyalty/calculatePointsEarning/pointsEarningsRepository");
const {
  createTransactionService,
} = require("../../../app/userWalletService/transactions/services/unifiedTransactionsService");
const {
  handleLoyaltyEarningConsequences,
} = require("../../../commonModules/paymentsIntegrations/dummyChargeForTesting/orderFinalizers/handleLoyaltyEarningConsequences");
const webhookRepository = require("../../../commonModules/paymentsIntegrations/paymentsWebhook/repositories/webhookRepository");
const { getOrgCompanyOrganizer } = require("../../../admin/organizations/organizationRepository");

const getDateRange = (period) => {
  const now = new Date();
  let start, end;

  switch (period) {
    case "today":
      start = new Date(now);
      end = new Date(now);
      break;

    case "yesterday":
      start = new Date(now);
      start.setUTCDate(start.getUTCDate() - 1);

      end = new Date(start);
      break;

    case "last7days":
      start = new Date(now);
      start.setUTCDate(start.getUTCDate() - 6);

      end = new Date(now);
      break;

    case "thisMonth":
      start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
      break;

    default:
      throw new Error(`Unknown period: ${period}`);
  }

  // Start of day (UTC)
  start.setUTCHours(0, 0, 0, 0);

  // End of day (UTC)
  end.setUTCHours(23, 59, 59, 999);

  return {
    startDate: start,
    endDate: end,
  };
};
const getOrdersService = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  organization,
  date,
  range,
  paymentMethod,
  pickupFilter,
  orderStatus,
  paymentStatus,
}) => {
  page = Number(page) || 1;
  limit = Number(limit);

  if (Number.isNaN(limit) || limit < 0) {
    limit = 10;
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;
  let startDate = null;
  let endDate = null;
  if (range) {
    ({ startDate, endDate } = getDateRange(range));
  }
  console.log("startDate", startDate, "endDate", endDate);
  const companyOrganizer = await getOrgCompanyOrganizer(organization);
  let { Orderss, meta } = await OrdersRepo.getOrders({
    timezone,
    page,
    limit,
    keyword,
    status,
    organization,
    date,
    range,
    paymentMethod,
    pickupFilter,
    skip,
    startDate,
    endDate,
    companyOrganizer,
    orderStatus,
    paymentStatus,
  });

  return { Orderss, meta };
};

const updateOrderDetailsService = async ({ orderId, data }) => {
  const order = await OrdersRepo.findOrdersById(orderId);
  const updateBy = data.updateBy;

  if (!order) {
    return { error: "Orders_not_found" };
  }
  /* ===============================
     🚫 Guards
  =============================== */

  // ❌ Cannot cancel paid order
  if (order.paymentStatus === "paid" && data.status === "cancelled") {
    return { error: "Cant_Cancel_paid_order" };
  }

  // ❌ Prevent payment change if already paid
  if (order.paymentStatus === "paid" && data.paymentStatus !== undefined && data.paymentStatus !== "paid") {
    return { error: "Cant_change_paid_payment_status" };
  }

  // ALREADY PAID
  if (order.paymentStatus === "paid" && data.paymentStatus === "paid") {
    return { error: "order_already_paid" };
  }
  const updateHistory = {
    updatedAt: new Date(),
    updatedBy: updateBy, // Assuming `updateBy` is the User ID
    updateData: data, // This would contain all the updated fields
  };

  order.updateHistory.push(updateHistory);
  if (!order.updateHistory) {
    order.updateHistory = [];
  }

  let statusChanged = false;
  let paymentChanged = false;
  let deliveryChanged = false;

  /* ===============================
     1️⃣ STATUS
  =============================== */
  if (data.status !== undefined && data.status !== order.status) {
    order.status = data.status;
    if (["pending", "confirmed", "rejected"].includes(data.status)) {
      order.items.forEach((item) => {
        item.status = data.status;
      });
    }
    statusChanged = true;
  }

  /* ===============================
     2️⃣ PAYMENT STATUS
  =============================== */
  if (data.paymentStatus !== undefined && data.paymentStatus !== order.paymentStatus) {
    order.paymentStatus = data.paymentStatus;
    paymentChanged = true;

    if (data.paymentStatus === "paid" && !order.paidAt) {
      order.paidAt = new Date();
    }

    /* ==========================
           🎯 Loyalty Points
        ========================== */
    const totalPrice = order.totalPrice || 0;

    if (totalPrice > 0) {
      const saveTransaction = await webhookRepository.saveIfNotProcessed({
        provider: "cash",
        orderNumber: order._id,
        orderType: "menuorders",
        user: order.user,
        companyOrganizer: order.organization.creator,
        organization: order.organization._id,
        paymentStatus: "paid",
        paymentMethod: order.paymentMethod,
        amount: order.totalPrice,
        payload: order,
      });
      const pointsCalculation = await calculatePointsRepo(order.user, order.organization.creator, totalPrice);

      let companyPoints = {
        base: pointsCalculation.organizer.earnedPoints,
        multiplier: pointsCalculation.organizer.organizerMultiplier || 1,
        total: pointsCalculation.organizer.earnedPoints,
        pointsPerEuro: pointsCalculation.organizer.pointsPerEuro,
      };
      let globalPoints = {
        base: pointsCalculation.global.earnedPoints,
        multiplier: pointsCalculation.global.globalMultiplier || 1,
        total: pointsCalculation.global.earnedPoints,
        pointsPerEuro: pointsCalculation.global.pointsPerEuro,
      };

      const trx = await createTransactionService(
        {
          user: order.user,
          companyOrganizer: order.organization.creator,
          organization: order.organization._id,
          companyPoints,
          globalPoints,
          allowNegative: false,
          type: "earn",
          description: "Menu order payment",
          entityId: order._id,
          domainType: "menuorders",
        },
        null,
      );

      if (!trx.success) {
        throw new Error(trx.message || "failed_loyalty_update");
      }

      handleLoyaltyEarningConsequences({
        userId: order.user,
        companyOrganizer: order.organization.creator,
        companyPoints: companyPoints,
        globalPoints: globalPoints,
        menuOrder: order,
      });
    }
  }

  /* ===============================
     3️⃣ DELIVER ALL
  =============================== */
  if (typeof data.deliveredall === "boolean") {
    order.items.forEach((item) => {
      item.isdelivered = data.deliveredall;
    });
    deliveryChanged = true;
  } else if (data.deliveredMenuItem) {
    /* ===============================
     4️⃣ DELIVER SELECTED ITEMS
  =============================== */
    const deliveredIds = data.deliveredMenuItem
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .map((id) => new mongoose.Types.ObjectId(id));

    order.items.forEach((item) => {
      if (deliveredIds.some((dId) => dId.equals(item.menuItem))) {
        item.isdelivered = true;
        deliveryChanged = true;
      }
    });
  }
  if (data.resaonForRejection) {
    order.reasonForRejection = data.reasonForRejection;
  }
  if (data.reasonForCancellation) {
    order.reasonForCancellation = data.reasonForCancellation;
  }
  if (data.noteForRejection) {
    order.noteForRejection = data.noteForRejection;
  }
  if (data.noteForCancellation) {
    order.noteForCancellation = data.noteForCancellation;
  }

  await order.save();

  /* ===============================
     SOCKET UPDATE
  =============================== */
  emitOrderEvent({
    io: global.io,
    eventName: "ORDER_UPDATE",
    orderId: order._id,
    organizationId: order.organization,
    userId: order.user,
    data: {
      status: order.status,
      paymentStatus: order.paymentStatus,
    },
  });

  /* ===============================
     NOTIFICATIONS
  =============================== */

  if (statusChanged || paymentChanged || deliveryChanged) {
    sendUserNotifications({
      recipientIds: [order.user.toString()],
      title: "Order Updated",
      body: `Your order ${order.orderNumber} status is now ${order.status}`,
      data: {
        type: NotificationTypes.ORDER_UPDATE,
        objectType: "menuorders",
      },
      image: order.items?.[0]?.menuItemSnapShot?.image || null,
      sender: order.organization,
      objectId: order._id,
    });
  }

  if (paymentChanged && order.paymentStatus === "paid") {
    sendUserNotifications({
      recipientIds: [order.user.toString()],
      title: "Order Paid",
      body: `Order ${order.orderNumber} has been paid`,
      data: {
        type: NotificationTypes.ORDER_UPDATE,
        objectType: "menuorders",
      },
      sender: order.organization,
      objectId: order._id,
    });
  }

  return order;
};

const updateInAppOrders = async (organization, isOrderingEnabled) => {
  try {
    return await Menus.updateMany({ organization }, { $set: { isOrderingEnabled } }, { upsert: true });
  } catch (error) {
    throw error;
  }
};

const getInAppOrders = async ({ timezone, page, limit, keyword, status, organization }) => {
  page = Number(page) || 1;
  limit = Number(limit);
  if (limit) {
    limit += 1;
  }

  if (Number.isNaN(limit) || limit < 0) {
    limit = 10;
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });

  let data = await OrdersRepo.getInAppOrders({
    timezone,
    page,
    limit,
    keyword,
    status,
    organization,
    today,
    skip,
  });

  return data;
};

const sendPaymentReminder = async (orderId) => {
  try {
    const order = await OrdersRepo.getOrderById(orderId);

    if (!order) {
      return { error: "Order not found" };
    }

    await sendUserNotifications({
      recipientIds: [order.user.toString()],
      title: "Payment Reminder",
      body: `Reminder: Please complete the payment for order ${order.orderNumber} to avoid cancellation.`,
      data: {
        type: NotificationTypes.REMINDER,
        objectType: "menuorders",
      },
      sender: order.organization,
      objectId: order._id,
    });

    return { success: true, message: "Payment reminder sent successfully" };
  } catch (error) {
    console.error("Error sending payment reminder:", error);
    return { error: "Failed to send payment reminder" };
  }
};

module.exports = {
  getOrdersService,
  updateInAppOrders,
  updateOrderDetailsService,
  getInAppOrders,
  sendPaymentReminder,
};
