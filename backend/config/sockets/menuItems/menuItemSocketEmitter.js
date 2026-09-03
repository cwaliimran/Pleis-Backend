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

function emitMenuItemEvent({
  io,
  eventName = "MENU_ITEM_CHANGED",
  menuItemId,
  organizationId,
  data = {},
  updateTypes,
}) {
  if (!io) return;

  const orgId = toId(organizationId);
  if (!orgId) return;

  const payload = {
    event: eventName,
    menuItemId: toId(menuItemId),
    organizationId: orgId,
    data: toPlain(data),
    timestamp: Date.now(),
  };

  if (updateTypes) {
    payload.updateTypes = updateTypes;
  }

  io.of("/user/menu").to(`org:${orgId}`).emit(eventName, payload);
  io.of("/staff/menu").to(`org:${orgId}`).emit(eventName, payload);
  io.of("/admin/menu").to(`org:${orgId}`).emit(eventName, payload);
  io.of("/organizer/menu").to(`org:${orgId}`).emit(eventName, payload);
}

module.exports = { emitMenuItemEvent };
