const { getFullImageUrl } = require("@utils/imageHelper");

function formatGlobalRewardCategory(item) {
  let obj = typeof item.toObject === "function" ? item.toObject() : item;

  if (!obj) return null;

  // Format image URL
  obj.image = getFullImageUrl(obj.image || "noimage.png");

  return obj;
}

module.exports = { formatGlobalRewardCategory };
