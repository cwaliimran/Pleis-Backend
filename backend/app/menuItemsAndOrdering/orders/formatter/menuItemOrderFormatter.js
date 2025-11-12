const { getFullImageUrl } = require("@utils/imageHelper");
const { convertUtcToTimezone } = require("@utils/responseUtil");

/**
 * Format the order and each menu item snapshot for display
 */
function menuItemOrderFormatter(order, timezone) {
  if (!order) return null;

  const obj = typeof order.toObject === "function" ? order.toObject() : order;

  if (Array.isArray(obj.items)) {
    obj.items = obj.items.map((item) => {
      if (item.menuItemSnapShot) {
        const snap = item.menuItemSnapShot;

        // Format image URL
        snap.image = getFullImageUrl(snap.image || "noimage.png");

        // Convert stored UTC times to user's timezone
        if (snap.startTime && snap.endTime) {
          snap.startTime = convertUtcToTimezone(snap.startTime, timezone, "hh:mm A");
          snap.endTime = convertUtcToTimezone(snap.endTime, timezone, "hh:mm A");
        }

        // Clean unnecessary fields
        delete snap.menu;
        delete snap.__v;
        delete snap.createdAt;
        delete snap.updatedAt;
        delete snap.creator;
      }

      return item;
    });
  }

  delete obj.__v;
  return obj;
}

module.exports = { menuItemOrderFormatter };
