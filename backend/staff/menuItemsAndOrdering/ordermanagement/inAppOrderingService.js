const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const OrdersRepo = require("./inAppOrderingRepository");
const mongoose = require("mongoose");
const { sendUserNotifications } = require("../../../controllers/communicationController");
const { NotificationTypes } = require("@NotificationsModel");
const { emitOrderUpdate } = require("@socketIo/orders/orderSocketEmitter");
const { fireAndForget } = require("../../../helperUtils/responseUtil");
const { enqueueFiscalDocument } = require("../../../bullmq/queues");


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

  /* ===============================
     1️⃣ UPDATE ORDER STATUS (OPTIONAL)
  =============================== */
  if (data.status !== undefined) {
    order.status = data.status;

  }

  /* ===============================
     2️⃣ UPDATE PAYMENT STATUS (OPTIONAL)
  =============================== */
  if (data.paymentStatus !== undefined) {
    order.paymentStatus = data.paymentStatus;

    if (data.paymentStatus === "paid" && !order.paidAt) {
      order.paidAt = new Date();
    }
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
    }
  }


  await order.save();

  if (data.paymentStatus === "paid") {
    fireAndForget(
      enqueueFiscalDocument({
        kind: "ordering_confirmation",
        orderId: order._id,
      }),
      "FISCAL_ORDERING_CONFIRMATION",
    );
  }

  const updateTypes = [];
  if (data.status !== undefined) updateTypes.push("status");
  if (data.paymentStatus !== undefined) updateTypes.push("payment");
  if (
    typeof data.deliveredall === "boolean" ||
    data.deliveredMenuItem ||
    data.deliveredCombo
  ) {
    updateTypes.push("delivery");
  }
  emitOrderUpdate(order, updateTypes.length ? updateTypes : ["order"]);


  sendUserNotifications({
    recipientIds: [order.user.toString()],
    title: "Order Updated",
    body: `Your order ${order.orderNumber} has been updated to status: ${order.status}`,
    data: {
      type: NotificationTypes.ORDER_UPDATE,
      objectType: "menuorders",
    },
    image: order.items[0].menuItemSnapShot.image || null,
    sender: order.organization,
    objectId: order._id,
  });
  return order;
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