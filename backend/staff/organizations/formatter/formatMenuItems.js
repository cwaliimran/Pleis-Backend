const { getFullImageUrl } = require("@utils/imageHelper");

/**
 * Formats the `object` field inside BannerControls dynamically
 * depending on its type and model.
 *
 * @param {Object} obj - Populated `object` document
 */
function formatItemCategory(item) {
  if (!item) return null;

  let obj = typeof item.toObject === "function" ? item.toObject() : item;

  if (!obj) return null;

  // -----------------------------
  // Format LOGO
  // -----------------------------
  if (obj.basicInfo?.media?.logo) {
    obj.basicInfo.media.logo = getFullImageUrl(obj.basicInfo.media.logo);
  }

  // -----------------------------
  // Format COVER
  // -----------------------------
  if (obj.basicInfo?.media?.cover) {
    obj.basicInfo.media.cover = getFullImageUrl(obj.basicInfo.media.cover);
  }

  // -----------------------------
  // Format staff user profile images (if they exist)
  // -----------------------------
  if (Array.isArray(obj.staff)) {
    obj.staff = obj.staff.map((s) => {
      if (s.user?.profilePic) {
        s.user.profilePic = getFullImageUrl(s.user.profilePic);
      }
      return s;
    });
  }

  return obj;
}


module.exports = { formatItemCategory };
