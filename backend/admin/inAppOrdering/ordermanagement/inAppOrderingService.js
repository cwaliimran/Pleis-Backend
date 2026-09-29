const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const OrdersRepo = require("./inAppOrderingRepository");
const { NotificationTypes } = require("@NotificationsModel");
const mongoose = require("mongoose");
const Menus = require("@MenusModel");
const { emitOrderUpdate } = require("@socketIo/orders/orderSocketEmitter");
const { sendUserNotifications } = require("../../../controllers/communicationController");
const {
  menuOrderFinalizerService,
} = require("../../../commonModules/paymentsIntegrations/dummyChargeForTesting/orderFinalizers/menuOrderFinalizerService");
const { getOrgCompanyOrganizer } = require("../../../admin/organizations/organizationRepository");
const { fireAndForget } = require("../../../helperUtils/responseUtil");
const { maybeEnqueueOrderingConfirmation } = require("../../../commonModules/fiscalDocuments/fiscalTiming");
const { syncMonriTransactionStatus } = require("../../../commonModules/paymentsIntegrations/monri/monriRepository");
const {
  assertFulfilmentTransition,
  assertPaymentTransition,
  normalizeFulfilmentStatus,
  resolveStaffNextActions,
  resolveGuestNextStep,
} = require("../../../commonModules/menuItemsAndOrders/orderLifecycle");

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

  // ❌ Cannot cancel paid / unpaid-closed order
  if (
    (order.paymentStatus === "paid" || order.paymentStatus === "unpaidClosed") &&
    data.status === "cancelled"
  ) {
    return { error: "Cant_Cancel_paid_order" };
  }

  // ❌ Prevent payment change if already paid or unpaid-closed
  if (
    (order.paymentStatus === "paid" || order.paymentStatus === "unpaidClosed") &&
    data.paymentStatus !== undefined &&
    data.paymentStatus !== order.paymentStatus
  ) {
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
  let markPaidViaFinalizer = false;
  const updateTypes = [];

  /* ===============================
     1️⃣ STATUS (fulfilment axis)
  =============================== */
  if (data.status !== undefined && data.status !== order.status) {
    if (
      (data.status === "rejected" || normalizeFulfilmentStatus(data.status) === "rejected") &&
      !(data.reasonForRejection || data.resaonForRejection)
    ) {
      return { error: "rejection_reason_required" };
    }
    if (
      data.status === "cancelled" &&
      !data.reasonForCancellation
    ) {
      return { error: "cancellation_reason_required" };
    }

    let nextStatus;
    try {
      nextStatus = assertFulfilmentTransition(order, data.status);
    } catch (e) {
      return { error: e.message || "invalid_fulfilment_transition" };
    }

    order.status = nextStatus;
    if (["pending", "confirmed", "rejected"].includes(nextStatus)) {
      order.items.forEach((item) => {
        item.status = nextStatus === "delivered" ? item.status : nextStatus;
      });
    }
    if (nextStatus === "delivered" || nextStatus === "completed") {
      (order.items || []).forEach((item) => {
        item.isdelivered = true;
      });
      (order.combos || []).forEach((combo) => {
        combo.isdelivered = true;
      });
      deliveryChanged = true;
    }
    statusChanged = true;
    updateTypes.push("status");
  }

  /* ===============================
     2️⃣ PAYMENT STATUS
  =============================== */
  if (data.paymentStatus !== undefined && data.paymentStatus !== order.paymentStatus) {
    try {
      assertPaymentTransition(order, data.paymentStatus);
    } catch (e) {
      return { error: e.message || "invalid_payment_transition" };
    }

    paymentChanged = true;
    updateTypes.push("payment");

    if (data.paymentStatus === "paid") {
      markPaidViaFinalizer = (order.totalPrice || 0) > 0;
      if (!markPaidViaFinalizer) {
        order.paymentStatus = data.paymentStatus;
        if (!order.paidAt) {
          order.paidAt = new Date();
        }
      }
    } else {
      order.paymentStatus = data.paymentStatus;
    }
  }

  /* ===============================
     3️⃣ DELIVER ALL
  =============================== */
  if (typeof data.deliveredall === "boolean") {
    (order.items || []).forEach((item) => {
      item.isdelivered = data.deliveredall;
    });
    (order.combos || []).forEach((combo) => {
      combo.isdelivered = data.deliveredall;
    });
    deliveryChanged = true;
    updateTypes.push("delivery");
  } else {
    /* ===============================
       4️⃣ DELIVER SELECTED MENU ITEMS
    =============================== */
    if (data.deliveredMenuItem) {
      const deliveredIds = String(data.deliveredMenuItem)
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
        .map((id) => new mongoose.Types.ObjectId(id));

      (order.items || []).forEach((item) => {
        if (deliveredIds.some((dId) => dId.equals(item.menuItem))) {
          item.isdelivered = true;
          deliveryChanged = true;
          if (!updateTypes.includes("delivery")) updateTypes.push("delivery");
        }
      });
    }

    /* ===============================
       5️⃣ DELIVER WHOLE COMBOS (by combo id)
    =============================== */
    if (data.deliveredCombo) {
      const deliveredComboIds = String(data.deliveredCombo)
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
        .map((id) => new mongoose.Types.ObjectId(id));

      (order.combos || []).forEach((combo) => {
        if (
          deliveredComboIds.some(
            (dId) => dId.equals(combo.combo) || dId.equals(combo._id),
          )
        ) {
          combo.isdelivered = true;
          deliveryChanged = true;
          if (!updateTypes.includes("delivery")) updateTypes.push("delivery");
        }
      });
    }
  }
  if (data.reasonForRejection || data.resaonForRejection) {
    order.reasonForRejection = data.reasonForRejection || data.resaonForRejection;
    updateTypes.push("rejection");
  }
  if (data.reasonForCancellation) {
    order.reasonForCancellation = data.reasonForCancellation;
    updateTypes.push("cancellation");
  }
  if (data.noteForRejection) {
    order.noteForRejection = data.noteForRejection;
    if (!updateTypes.includes("rejection")) updateTypes.push("rejection");
  }
  if (data.noteForCancellation) {
    order.noteForCancellation = data.noteForCancellation;
    if (!updateTypes.includes("cancellation")) updateTypes.push("cancellation");
  }
  if (data.paymentMethod !== undefined && data.paymentMethod !== order.paymentMethod) {
    order.paymentMethod = data.paymentMethod;
    updateTypes.push("paymentMethod");
  }

  if (markPaidViaFinalizer) {
    await menuOrderFinalizerService({
      menuOrderId: order._id,
      result: {
        status: "paid",
        transactionId: order.transactionId || null,
      },
    });
    const refreshed = await OrdersRepo.findOrdersById(orderId);
    if (refreshed) {
      order.paymentStatus = refreshed.paymentStatus;
      order.paidAt = refreshed.paidAt;
      order.transactionId = refreshed.transactionId;
      order.hideUntilPaid = refreshed.hideUntilPaid;
      if (refreshed.status === "confirmed" && order.status === "pending") {
        order.status = refreshed.status;
      }
    }
  }

  await order.save();

  if (paymentChanged && order.paymentStatus === "paid" && !markPaidViaFinalizer) {
    maybeEnqueueOrderingConfirmation(order);
  } else if (!markPaidViaFinalizer && order.paymentStatus === "paid") {
    maybeEnqueueOrderingConfirmation(order);
  }

  if (paymentChanged && order.paymentStatus === "paid") {
    fireAndForget(
      syncMonriTransactionStatus(order._id, "paid"),
      "MONRI_TX_SYNC_PAID",
    );
  }

  emitOrderUpdate(order, updateTypes.length ? updateTypes : ["order"]);

  /* ===============================
     NOTIFICATIONS
  =============================== */

  const paidViaFinalizer = markPaidViaFinalizer && order.paymentStatus === "paid";
  const guestNextStep = resolveGuestNextStep(order);
  const confirmedPayInWallet =
    statusChanged &&
    order.status === "confirmed" &&
    guestNextStep?.payInWallet === true;

  if (confirmedPayInWallet && !paidViaFinalizer) {
    sendUserNotifications({
      recipientIds: [order.user.toString()],
      titleKey: "menu_order_confirmed_pay_title",
      bodyKey: "menu_order_confirmed_pay_body",
      bodyValues: { orderNumber: order.orderNumber },
      data: {
        type: NotificationTypes.MENU_ORDER_CONFIRMED,
        orderId: order._id,
        objectType: "menuorders",
      },
      image:
        order.items?.[0]?.menuItemSnapShot?.image ||
        order.combos?.[0]?.items?.[0]?.menuItemSnapShot?.image ||
        null,
      sender: order.organization,
      objectId: order._id,
    });
  } else if (
    (statusChanged || deliveryChanged) &&
    !(paymentChanged && order.paymentStatus === "paid")
  ) {
    sendUserNotifications({
      recipientIds: [order.user.toString()],
      titleKey: "order_updated_title",
      bodyKey: "order_updated_body",
      bodyValues: {
        orderNumber: order.orderNumber,
        status: order.status,
      },
      data: {
        type: NotificationTypes.ORDER_UPDATE,
        objectType: "menuorders",
      },
      image:
        order.items?.[0]?.menuItemSnapShot?.image ||
        order.combos?.[0]?.items?.[0]?.menuItemSnapShot?.image ||
        null,
      sender: order.organization,
      objectId: order._id,
    });
  }

  // Finalizer already sends MENU_ORDER_PAID when mark-paid goes through it.
  if (paymentChanged && order.paymentStatus === "paid" && !paidViaFinalizer) {
    sendUserNotifications({
      recipientIds: [order.user.toString()],
      titleKey: "order_paid_title",
      bodyKey: "order_paid_body",
      bodyValues: { orderNumber: order.orderNumber },
      data: {
        type: NotificationTypes.MENU_ORDER_PAID,
        objectType: "menuorders",
      },
      sender: order.organization,
      objectId: order._id,
    });
  }

  const plain = typeof order.toObject === "function" ? order.toObject() : order;
  if (plain.status === "completed" || plain.status === "sent") plain.status = "delivered";
  plain.nextActions = resolveStaffNextActions(order);
  plain.guestNextStep = guestNextStep;
  return plain;
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
      titleKey: "payment_reminder_title",
      bodyKey: "payment_reminder_body",
      bodyValues: { orderNumber: order.orderNumber },
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
