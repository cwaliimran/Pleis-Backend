const { getFullImageUrl } = require("../../../helperUtils/imageHelper");

const formatEventOrder = (item) => {
  let obj = typeof item.toObject === "function" ? item.toObject() : item;

  if (!obj) return null;

  // Update media URLs in-place
  if (obj.user && typeof obj.user === "object" && !obj.user._bsontype) {
    obj.user.profileIcon = getFullImageUrl(obj.user.profileIcon, "user");
  }

  return obj;
};


module.exports = {
  formatEventOrder
};
