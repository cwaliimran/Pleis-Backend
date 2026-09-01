const { getFullImageUrl } = require("@utils/imageHelper");
const { convertUtcToTimezone } = require("@utils/responseUtil");
const { attachMenuIds } = require("../../../../shared/menuItems/menuField");

/**
 * Formats a menu item for admin/organizer responses.
 * `menu` is always an array of menus; `menuIds` is the id list for update forms.
 */
function formatMenuItem(item, timezone) {
  let obj = typeof item.toObject === "function" ? item.toObject() : item;
  if (!obj) return null;

  obj.image = getFullImageUrl(obj.image || "noimage.png");
  if (obj.startTime) {
    obj.startTime = convertUtcToTimezone(obj.startTime, timezone, "hh:mm A");
  }

  if (obj.endTime) {
    obj.endTime = convertUtcToTimezone(obj.endTime, timezone, "hh:mm A");
  }

  if (obj.startDate) {
    obj.startDate = convertUtcToTimezone(obj.startDate, timezone, "YYYY-MM-DD");
  }

  if (obj.endDate) {
    obj.endDate = convertUtcToTimezone(obj.endDate, timezone, "YYYY-MM-DD");
  }

  if (obj.menuData) {
    obj.menu = obj.menuData;
  }

  if (obj.categoryData) {
    obj.category = obj.categoryData;
  }

  delete obj.menuData;
  delete obj.categoryData;

  return attachMenuIds(obj);
}

function formatBundleMenuItem(item, timezone) {
  let obj = typeof item.toObject === "function" ? item.toObject() : item;
  if (!obj) return null;

  if (obj.startTime && obj.endTime) {
    obj.startTime = convertUtcToTimezone(obj.startTime, timezone, "hh:mm A");
    obj.endTime = convertUtcToTimezone(obj.endTime, timezone, "hh:mm A");
  }

  return {
    _id: obj._id,
    title: obj.title,
    price: obj.basePrice || 0,
  };
}

module.exports = { formatMenuItem, formatBundleMenuItem };
