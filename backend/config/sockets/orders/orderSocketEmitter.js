const {
  getOrderByIdForAdminUI,
  withOrderItemImageUrls,
} = require("../../../admin/inAppOrdering/ordermanagement/inAppOrderingRepository");

function toId(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value.toHexString === "function") return value.toHexString();
  if (value._id) return toId(value._id);
  const asString = String(value);
  return asString && asString !== "[object Object]" ? asString : null;
}

function toPlain(value) {
  if (!value) return value;
  if (typeof value.toJSON === "function") return value.toJSON();
  if (typeof value.toObject === "function") return value.toObject();
  return value;
}

function emitOrderEvent({
  io,
  eventName,
  orderId,
  organizationId,
  userId,
  data = {},
  updateTypes,
}) {
  void emitOrderEventAsync({
    io,
    eventName,
    orderId,
    organizationId,
    userId,
    data,
    updateTypes,
  }).catch((err) => {
    console.error("Order socket emit failed:", err);
  });
}

async function emitOrderEventAsync({
  io,
  eventName,
  orderId,
  organizationId,
  userId,
  data = {},
  updateTypes,
}) {
  if (!io) return;

  const orgId = toId(organizationId);
  const uid = toId(userId);
  const fallbackData = withOrderItemImageUrls(toPlain(data));

  let orgData = fallbackData;
  try {
    const listShape = await getOrderByIdForAdminUI(orderId);
    if (listShape) {
      orgData = JSON.parse(JSON.stringify(listShape));
    }
  } catch (err) {
    console.error("Order socket list-shape fetch failed:", err);
  }

  const payloadBase = {
    event: eventName,
    orderId: toId(orderId),
    organizationId: orgId,
    timestamp: Date.now(),
  };

  if (updateTypes) {
    payloadBase.updateTypes = updateTypes;
  }

  if (orgId) {
    const payload = { ...payloadBase, data: orgData };
    io.of("/staff/orders").to(`org:${orgId}`).emit(eventName, payload);
    io.of("/admin/orders").to(`org:${orgId}`).emit(eventName, payload);
    io.of("/organizer/orders").to(`org:${orgId}`).emit(eventName, payload);
  }

  if (uid) {
    io.of("/user/orders")
      .to(`user:${uid}`)
      .emit(eventName, { ...payloadBase, data: fallbackData });
  }
}

function emitOrderUpdate(order, updateTypes = []) {
  if (!order) return;
  emitOrderEvent({
    io: global.io,
    eventName: "ORDER_UPDATE",
    orderId: order._id,
    organizationId: order.organization?._id || order.organization,
    userId: order.user?._id || order.user,
    data: order,
    updateTypes,
  });
}

function emitNewOrder(order, data) {
  if (!order) return;
  emitOrderEvent({
    io: global.io,
    eventName: "NEW_ORDER",
    orderId: order._id,
    organizationId: order.organization?._id || order.organization,
    userId: order.user?._id || order.user,
    data: data || order,
  });
}

function emitMenuOrderPaymentSockets(order, status, { includeNewOrder = true } = {}) {
  if (!order) return;

  const updateTypes =
    status === "failed"
      ? ["status", "payment", "cancellation"]
      : ["status", "payment"];

  emitOrderUpdate(order, updateTypes);

  if (includeNewOrder && status === "paid") {
    emitNewOrder(order);
  }
}

module.exports = {
  emitOrderEvent,
  emitOrderUpdate,
  emitNewOrder,
  emitMenuOrderPaymentSockets,
};
