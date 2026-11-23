const { getFullImageUrl } = require("../../../helperUtils/imageHelper");


const formatEventAttendeesResponse = (item, options = {}) => {
  let obj = typeof item.toObject === "function" ? item.toObject() : item;

  if (!obj) return null;

  const { timezone = "UTC", includeFields = [], excludeFields = [] } = options;

  // Update media URLs in-place
  if (obj.user && typeof obj.user === "object" && !obj.user._bsontype) {
    obj.user.profileIcon = getFullImageUrl(obj.user.profileIcon, "user");
  }

  return obj;
};



module.exports = {
  formatEventAttendeesResponse,
};
