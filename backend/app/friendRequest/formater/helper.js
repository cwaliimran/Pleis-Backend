const { getFullImageUrl } = require("@utils/imageHelper");
const { convertUtcToTimezone } = require("@utils/responseUtil");



const escapeRegex = (value) => {
  if (!value) return value;
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

function menuItemOrderFormatter(orders) {
  if (!Array.isArray(orders)) return [];

  return orders.map(order => {
    const obj = typeof order.toObject === "function" ? order.toObject() : order;

    // Replace only profileIcon
    obj.profileIcon = obj.profileIcon
      ? getFullImageUrl(obj.profileIcon)
      : getFullImageUrl("noimage.png");

    return obj;
  });
}


module.exports = {
escapeRegex,
menuItemOrderFormatter
};

