const { getFullImageUrl } = require("@utils/imageHelper");

function formatGlobalNotification(item) {

  let obj = typeof item.toObject === "function" ? item.toObject() : item;

  if (!obj) return null;

  delete obj.__v;
  // Handle media transformation for aggregation structure
  if (obj.image) {
    obj.image = getFullImageUrl(obj.image);
  }

  return obj;
}

module.exports = { formatGlobalNotification };
