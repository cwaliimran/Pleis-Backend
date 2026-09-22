const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const OrdersRepo = require("./inAppOrderingRepository");
const mongoose = require("mongoose");
const { sendUserNotifications } = require("../../../controllers/communicationController");
const { NotificationTypes } = require("@NotificationsModel");
const { emitOrderUpdate } = require("@socketIo/orders/orderSocketEmitter");
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


const getOrders = async ({ activeorderStatus, pickupFilter, orderStatus, activeKeyword, timezone, page, limit, keyword, status, organizationId, date, range }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { Orderss, meta } = await OrdersRepo.getOrders({ activeorderStatus, pickupFilter, orderStatus, activeKeyword, timezone, page, limit, keyword, status, organizationId, date, range, today, skip });

  return {
    Orderss,
    meta
  };
};

const updateOrders = async (staffId, id, data) => {
  const order = await OrdersRepo.findOrdersById(id);

  if (!order) {
    return { error: "Orders_not_found" };
  }

  // ❌ Cannot cancel a paid order
  if (order.paymentStatus === "paid" && data.status === "cancelled") {
    return { error: "Cant_Cancel_paid_order" };
  }

  const updateTypes = [];

  /* ===============================
     1️⃣ UPDATE ORDER STATUS (OPTIONAL)
  =============================== */
  if (data.status !== undefined && data.status !== order.status) {
    if (
      normalizeFulfilmentStatus(data.status) === "rejected" &&
      !(data.reasonForRejection || data.resaonForRejection)
    ) {
      return { error: "rejection_reason_required" };
    }
    if (data.status === "cancelled" && !data.reasonForCancellation) {
      return { error: "cancellation_reason_required" };
    }
    let nextStatus;
    try {
      nextStatus = assertFulfilmentTransition(order, data.status);
    } catch (e) {
      return { error: e.message || "invalid_fulfilment_transition" };
    }
    order.status = nextStatus;
    if (nextStatus === "delivered") {
      (order.items || []).forEach((item) => {
        item.isdelivered = true;
      });
      (order.combos || []).forEach((combo) => {
        combo.isdelivered = true;
      });
    }
    if (data.reasonForRejection || data.resaonForRejection) {
      order.reasonForRejection =
        data.reasonForRejection || data.resaonForRejection;
    }
    if (data.reasonForCancellation) {
      order.reasonForCancellation = data.reasonForCancellation;
    }
    updateTypes.push("status");
  }

  /* ===============================
     2️⃣ UPDATE PAYMENT STATUS (OPTIONAL)
  =============================== */
  if (
    data.paymentStatus !== undefined &&
    data.paymentStatus !== order.paymentStatus
  ) {
    try {
      assertPaymentTransition(order, data.paymentStatus);
    } catch (e) {
      return { error: e.message || "invalid_payment_transition" };
    }
    order.paymentStatus = data.paymentStatus;

    if (data.paymentStatus === "paid" && !order.paidAt) {
      order.paidAt = new Date();
    }
    updateTypes.push("payment");
  }

  /* ===============================
     3️⃣ DELIVER ALL (HIGHEST PRIORITY)
  =============================== */
  if (typeof data.deliveredall === "boolean") {
    (order.items || []).forEach((item) => {
      item.isdelivered = data.deliveredall;
    });
    (order.combos || []).forEach((combo) => {
      combo.isdelivered = data.deliveredall;
    });
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
        }
      });
      updateTypes.push("delivery");
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
        }
      });
      updateTypes.push("delivery");
    }
  }


  await order.save();

  // Payment confirmation when paid (amount>0 gated in helper); not at delivery
  maybeEnqueueOrderingConfirmation(order);

  if (data.paymentStatus === "paid") {
    fireAndForget(
      syncMonriTransactionStatus(order._id, "paid"),
      "MONRI_TX_SYNC_PAID",
    );
  }

  emitOrderUpdate(order, updateTypes.length ? updateTypes : ["order"]);


  sendUserNotifications({
    recipientIds: [order.user.toString()],
    titleKey: "order_updated_title",
    bodyKey: "order_updated_status_body",
    bodyValues: {
      orderNumber: order.orderNumber,
      status: order.status,
    },
    data: {
      type: NotificationTypes.ORDER_UPDATE,
      objectType: "menuorders",
    },
    image: order.items?.[0]?.menuItemSnapShot?.image || null,
    sender: order.organization,
    objectId: order._id,
  });

  const plain = typeof order.toObject === "function" ? order.toObject() : order;
  if (plain.status === "completed") plain.status = "delivered";
  plain.nextActions = resolveStaffNextActions(order);
  plain.guestNextStep = resolveGuestNextStep(order);
  return plain;
};

const deleteOrders = async (id) => {
  const updated = await OrdersRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  return true;
};

const updateIsOrderingEnabledService = async (organization, isOrderingEnabled) => {
  const updated = await OrdersRepo.updateIsOrderingEnabled(organization, isOrderingEnabled);
  return updated;
}

module.exports = {
  getOrders,
  updateOrders,
  deleteOrders,
  updateIsOrderingEnabledService

};