const { getFullImageUrl } = require("@utils/imageHelper");

const formatTopPick = (item) => {
  if (!item) return null;
  let obj = typeof item.toObject === "function" ? item.toObject() : item;

  // Attach base URL to image fields at all possible places
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
    return galleryMedia.map((img) => getFullImageUrl(img || "noimage.png"));
  };

  // Deep clone to avoid mutating original object
  let formatted = { ...obj };

  // Top-level image (if present)
  if (formatted.image) {
    formatted.image = getFullImageUrl(formatted.image || "noimage.png");
  }

  // organization.basicInfo.media
  if (
    formatted.organization &&
    formatted.organization.basicInfo &&
    formatted.organization.basicInfo.media
  ) {
    formatted.organization.basicInfo.media = formatMedia(
      formatted.organization.basicInfo.media
    );
  }

  // organization.otherInfo.galleryMedia
  if (
    formatted.organization &&
    formatted.organization.otherInfo &&
    formatted.organization.otherInfo.galleryMedia
  ) {
    formatted.organization.otherInfo.galleryMedia = formatGallery(
      formatted.organization.otherInfo.galleryMedia
    );
  }

  return formatted;
};

const formatTopPicks = (items = []) => {
  return items.map(formatTopPick);
}

module.exports = { formatTopPick, formatTopPicks };
