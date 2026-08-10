const { getFullImageUrl } = require("@utils/imageHelper");
const { convertUtcToTimezone } = require("@utils/responseUtil");

/**
 * Format the order and each menu item snapshot for display
 */
function menuItemOrderFormatter(order, timezone) {
  if (!order) return null;

  const obj = typeof order.toObject === "function" ? order.toObject() : order;
  if (Array.isArray(obj.reservation)) {
    obj.reservation = obj.reservation.map((r) => {
      const res = typeof r.toObject === "function" ? r.toObject() : r;

      if (res.timingSlots && Array.isArray(res.timingSlots.dateTimeSlots)) {
        res.timingSlots.dateTimeSlots = res.timingSlots.dateTimeSlots.map(
          (slot) => {
            if (slot.date) {
              slot.date = convertUtcToTimezone(slot.date, timezone);
            }
            if (Array.isArray(slot.timeSlots)) {
              slot.timeSlots = slot.timeSlots.map((ts) => {
                if (ts.startTime && ts.endTime) {
                  ts.startTime = convertUtcToTimezone(ts.startTime, timezone);
                  ts.endTime = convertUtcToTimezone(ts.endTime, timezone);
                }
                return ts;
              });
            }

            return slot;
          },
        );
      }

      if (res.reservationType) {
        delete res.reservationType.__v;
        delete res.reservationType.createdAt;
        delete res.reservationType.updatedAt;
      }

      return res;
    });
  }
  if (
    obj.organization &&
    obj.organization.basicInfo &&
    obj.organization.basicInfo.media
  ) {
    obj.organization.basicInfo.media.logo = getFullImageUrl(
      obj.organization.basicInfo.media.logo || "noimage.png",
    );
  }
  if (obj.user) {
    obj.user.profileIcon = getFullImageUrl(
      obj.user.profileIcon || "noimage.png",
    );
  }

  if (Array.isArray(obj.items)) {
    obj.items = obj.items.map((item) => {
      if (item.menuItemSnapShot) {
        const snap = item.menuItemSnapShot;

        // Format image URL
        snap.image = getFullImageUrl(snap.image || "noimage.png");

        // Convert stored UTC times to user's timezone
        if (snap.startTime && snap.endTime) {
          snap.startTime = convertUtcToTimezone(
            snap.startTime,
            timezone,
            "hh:mm A",
          );
          snap.endTime = convertUtcToTimezone(
            snap.endTime,
            timezone,
            "hh:mm A",
          );
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
              snap.startTime = convertUtcToTimezone(
                snap.startTime,
                timezone,
                "hh:mm A",
              );
              snap.endTime = convertUtcToTimezone(
                snap.endTime,
                timezone,
                "hh:mm A",
              );
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
