const { getFullImageUrl } = require("@utils/imageHelper");
const { convertUtcToTimezone } = require("@utils/responseUtil");

/**
 * Format the order and each menu item snapshot for display
 */
function menuItemOrderFormatter(order, timezone) {
  if (!order) return null;

  const obj = typeof order.toObject === "function" ? order.toObject() : order;

  if (obj.organization && obj.organization.basicInfo && obj.organization.basicInfo.media) {
    obj.organization.basicInfo.media.logo = getFullImageUrl(obj.organization.basicInfo.media.logo || "noimage.png");
  }
  if(obj.user) {
    obj.user.profileIcon = getFullImageUrl(obj.user.profileIcon || "noimage.png");
  }

  if (Array.isArray(obj.items)) {
    obj.items = obj.items.map((item) => {
      if (item.menuItemSnapShot) {
        const snap = item.menuItemSnapShot;

        // Format image URL
        snap.image = getFullImageUrl(snap.image || "noimage.png");x

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

  if (Array.isArray(obj.combos)) {
    obj.combos = obj.combos.map((combo) => {
      if (Array.isArray(combo.items)) {
        combo.items = combo.items.map((item) => {
          if (item.menuItemSnapShot) {
            const snap = item.menuItemSnapShot;
            snap.image = getFullImageUrl(snap.image || "noimage.png");

            if (snap.startTime && snap.endTime) {
              snap.startTime = convertUtcToTimezone(snap.startTime, timezone, "hh:mm A");
              snap.endTime = convertUtcToTimezone(snap.endTime, timezone, "hh:mm A");
            }

            delete snap.menu;
            delete snap.__v;
            delete snap.createdAt;
            delete snap.updatedAt;
            delete snap.creator;
          }
          return item;
        });
      }
      return combo;
    });
  }

  delete obj.__v;
  return obj;
}

module.exports = { menuItemOrderFormatter };
