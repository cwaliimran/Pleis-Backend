const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const OrdersRepo = require("./inAppOrderingRepository");
const { NotificationTypes } = require("@NotificationsModel");
const mongoose = require("mongoose");
const Menus = require("@MenusModel");
const { emitOrderEvent } = require("@socketIo/orders/orderSocketEmitter");
const { sendUserNotifications } = require("../../../controllers/communicationController");
const { calculatePointsRepo } = require("../../../app/loyalty/calculatePointsEarning/pointsEarningsRepository");
const { createTransaction } = require("../../../app/userWalletService/transactions/services/unifiedTransactionsService");



const getOrdersService = async ({
  activeorderStatus,
  pickupFilter,
  orderStatus,
  activeKeyword,
  timezone,
  page,
  limit,
  keyword,
  status,
  organization,
  date,
  range
}) => {
  page = Number(page) || 1;
  limit = Number(limit);


  if (Number.isNaN(limit) || limit < 0) {
    limit = 10;
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });


  let { Orderss, meta } = await OrdersRepo.getOrders({
    activeorderStatus,
    pickupFilter,
    orderStatus,
    activeKeyword,
    timezone,
    page,
    limit,
    keyword,
    status,
    organization,
    date,
    range,
    today,
    skip
  });

  return { Orderss, meta };
};


const updateOrderDetailsService = async ({
  orderId,
  data,
}) => {
  const order = await OrdersRepo.findOrdersById(orderId);

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
  if (
    order.paymentStatus === "paid" &&
    data.paymentStatus !== undefined &&
    data.paymentStatus !== "paid"
  ) {
    return { error: "Cant_change_paid_payment_status" };
  }

  // ALREADY PAID
  if (
    order.paymentStatus === "paid" &&
    data.paymentStatus === "paid"
  ) {
    return { error: "order_already_paid" };
  }


  let statusChanged = false;
  let paymentChanged = false;
  let deliveryChanged = false;

  /* ===============================
     1️⃣ STATUS
  =============================== */
  if (data.status !== undefined && data.status !== order.status) {
    order.status = data.status;
    statusChanged = true;
  }

  /* ===============================
     2️⃣ PAYMENT STATUS
  =============================== */
  if (
    data.paymentStatus !== undefined &&
    data.paymentStatus !== order.paymentStatus
  ) {
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
      const pointsCalculation = await calculatePointsRepo(
        order.user,
        order.organization.creator,
        totalPrice
      );

      const trx = await createTransaction(
        {
          user: order.user,
          companyOrganizer: order.organization.creator,
          organization: order.organization._id,
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
          entityId: order._id,
          domainType: "menuorders",
        },
        null
      );

      if (!trx.success) {
        throw new Error(trx.message || "failed_loyalty_update");
      }

    }

  }

  /* ===============================
     3️⃣ DELIVER ALL
  =============================== */
  if (typeof data.deliveredall === "boolean") {
    order.items.forEach(item => {
      item.isdelivered = data.deliveredall;
    });
    deliveryChanged = true;
  }

  /* ===============================
     4️⃣ DELIVER SELECTED ITEMS
  =============================== */
  else if (data.deliveredMenuItem) {
    const deliveredIds = data.deliveredMenuItem
      .split(",")
      .map(id => id.trim())
      .filter(Boolean)
      .map(id => new mongoose.Types.ObjectId(id));

    order.items.forEach(item => {
      if (deliveredIds.some(dId => dId.equals(item.menuItem))) {
        item.isdelivered = true;
        deliveryChanged = true;
      }
    });
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
      recipientIds: [order.organization.toString()],
      title: "Order Paid",
      body: `Order ${order.orderNumber} has been paid`,
      data: {
        type: NotificationTypes.ORDER_UPDATE,
        objectType: "menuorders",
      },
      sender: order.user,
      objectId: order._id,
    });
  }

  return order;
};


const updateInAppOrders = async (organization, isOrderingEnabled) => {
  try {
    return await Menus.updateMany(
      { organization },
      { $set: { isOrderingEnabled } },
      { upsert: true }
    );
  } catch (error) {
    throw error;
  }
};








const getInAppOrders = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  organization,
}) => {
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
    skip
  });

  return data;
};





module.exports = {
  getOrdersService,
  updateInAppOrders,
  updateOrderDetailsService,
  getInAppOrders

};