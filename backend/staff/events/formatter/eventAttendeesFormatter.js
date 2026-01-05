const { getFullImageUrl } = require("../../../helperUtils/imageHelper");


const formatEventAttendeesResponse = (item, options = {}) => {
  let obj = typeof item.toObject === "function" ? item.toObject() : item;

  if (!obj) return null;

  const { timezone = "UTC", includeFields = [], excludeFields = [] } = options;

  // Update media URLs in-place
  if (obj.user?.profileIcon) {
    obj.user.profileIcon = getFullImageUrl(obj.user.profileIcon);
  }

  return obj;
};



module.exports = {
  formatEventAttendeesResponse,
};
