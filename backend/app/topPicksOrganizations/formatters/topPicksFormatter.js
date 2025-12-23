const { getFullImageUrl } = require("@utils/imageHelper");

const formatTopPick = (item) => {
  if (!item) return null;

  const obj = typeof item.toObject === "function"
    ? item.toObject()
    : item;

  const formatted = { ...obj };

  // ---- Media helpers ----
  const formatMedia = (media) => {
    if (!media) return media;
    return {
      ...media,
      logo: getFullImageUrl(media.logo || "noimage.png"),
      cover: getFullImageUrl(media.cover || "noimage.png"),
    };
  };

  const formatGallery = (galleryMedia) => {
    if (!Array.isArray(galleryMedia)) return [];
    return galleryMedia.map(img =>
      getFullImageUrl(img || "noimage.png")
    );
  };

  // ---- FIXED PATHS ----

  // basicInfo.media
  if (formatted.basicInfo?.media) {
    formatted.basicInfo.media = formatMedia(formatted.basicInfo.media);
  }

  // otherInfo.galleryMedia
  if (formatted.otherInfo?.galleryMedia) {
    formatted.otherInfo.galleryMedia = formatGallery(
      formatted.otherInfo.galleryMedia
    );
  }

  // ---- Distance (already formatted in aggregation, just keep it) ----
  
  // distance formatting (meters → km)
  if (formatted.distance !== undefined && formatted.distance !== null) {
    const meters = Number(formatted.distance);
    if (Number.isFinite(meters)) {
      const km = meters / 1000;

      formatted.distance = {
        distance: Number(km.toFixed(2)),
        unit: "km",
      };
    }
  }

  return formatted;
};

const formatTopPicks = (items = []) => {
  return items.map(formatTopPick);
}

module.exports = { formatTopPick, formatTopPicks };
