const { getFullImageUrl } = require("@utils/imageHelper");
function badgesResponseFormatter(data) {
  if (!data || typeof data !== "object") return data;

  /* ===================== USER BADGES ===================== */
  if (Array.isArray(data.userBadges)) {
    data.userBadges = data.userBadges.map(item => {
      const obj = typeof item.toObject === "function"
        ? item.toObject()
        : { ...item };

      if (obj.badge) {
        obj.badge.icon = obj.badge.icon
          ? getFullImageUrl(obj.badge.icon)
          : getFullImageUrl("noimage.png");
      }

      return obj;
    });
  }

  /* ===================== ALL BADGES ===================== */
  if (Array.isArray(data.allBadges)) {
    data.allBadges = data.allBadges.map(badge => {
      const obj = typeof badge.toObject === "function"
        ? badge.toObject()
        : { ...badge };

      obj.icon = obj.icon
        ? getFullImageUrl(obj.icon)
        : getFullImageUrl("noimage.png");

      return obj;
    });
  }

  return data;
}



module.exports = {
badgesResponseFormatter
};

