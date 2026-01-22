const { getFullImageUrl } = require("@utils/imageHelper");
const { convertUtcToTimezone } = require("@utils/responseUtil");
const { formatCategories } = require("../../../admin/categories/formatters/categoryFormatter");
const { isOrganizationOpenNow, transformOperatingHoursToLocal } = require("../../../shared/commonSchemas/operatingHours");

/**
 * Formats the `object` field inside BannerControls dynamically
 * depending on its type and model.
 *
 * @param {Object} obj - Populated `object` document
 * @param {String} type - The type field ("Event", "Organizer", "LoyaltyProgram", etc.)
 * @returns {Object|null}
 */
function formatOrganization(item, excludeFields = []) {
  let org = typeof item.toObject === "function" ? item.toObject() : item;

  if (!org) return null;

  delete org.__v;

  // Handle media transformation for aggregation structure
  if (org.basicInfo?.media?.logo) {
    const logoName = org.basicInfo.media.logo;
    org.basicInfo.media.logo = getFullImageUrl(logoName);
  }

  if (org.basicInfo?.media?.cover) {
    const coverName = org.basicInfo.media.cover;
    org.basicInfo.media.cover = getFullImageUrl(coverName)
  }

  if (org.basicInfo?.media?.logo && typeof org.basicInfo.media.logo === 'object') {
    org.basicInfo.media.logo.url = getFullImageUrl(org.basicInfo.media.logo.name);
  }
  if (org.basicInfo?.media?.cover && typeof org.basicInfo.media.cover === 'object') {
    org.basicInfo.media.cover.url = getFullImageUrl(org.basicInfo.media.cover.name);
  }


  if (org.otherInfo?.galleryMedia && Array.isArray(org.otherInfo.galleryMedia)) {
    org.otherInfo.galleryMedia = org.otherInfo.galleryMedia.map((mediaName) => (getFullImageUrl(mediaName)));
  }
  if (org.creator?.companyDetails?.logo) {
    org.creator.companyDetails.logo = getFullImageUrl(org.creator.companyDetails.logo);
  }

  // also transform otherInfo.categories if they are populated and not just ObjectIds
  if (org.otherInfo?.categories && Array.isArray(org.otherInfo.categories)) {
    // Check if at least one element is a populated object (not just ObjectId or string)
    const hasPopulated = org.otherInfo.categories.some(
      cat =>
        cat &&
        typeof cat === 'object' &&
        cat._id &&
        // Exclude plain ObjectId objects (which have only _id and no other keys)
        (Object.keys(cat).length > 1 || (cat.title || cat.name))
    );
    if (hasPopulated) {
      org.otherInfo.categories = formatCategories(org.otherInfo.categories);
    }
  }

  //format tags if populated
  if (org.otherInfo?.tags && Array.isArray(org.otherInfo.tags)) {
    org.otherInfo.tags = org.otherInfo.tags.map(tag => {
      if (tag && typeof tag === 'object' && tag._id) {
        return {
          id: tag._id,
          title: tag.title,
        };
      }
      return tag;
    });
  }

  // Handle excludeFields
  if (excludeFields.length > 0) {
    excludeFields.forEach((fieldPath) => {
      const [mainField, subField] = fieldPath.split(".");
      if (subField) {
        if (org[mainField]) {
          delete org[mainField][subField];
        }
      } else {
        delete org[fieldPath];
      }
    });
  }

  //attach distance if exists
  // distance formatting (meters → km)
  if (item.distance !== undefined && item.distance !== null) {
    const meters = Number(item.distance);
    if (Number.isFinite(meters)) {
      const km = meters / 1000;

      org.distance = {
        distance: Number(km.toFixed(2)),
        unit: "km",
      };
    }
  }
  return org;
}
function formatNearByOrganization(item, timezone = "Asia/Karachi", excludeFields = []) {
  let org = typeof item.toObject === "function" ? item.toObject() : item;
  if (!org) return null;

  // Media transformation
  if (org.basicInfo?.media?.logo) {
    org.basicInfo.media.logo = getFullImageUrl(org.basicInfo.media.logo);
  }

  if (org.basicInfo?.media?.cover) {
    org.basicInfo.media.cover = getFullImageUrl(org.basicInfo.media.cover);
  }

  org.companyOrganizer = org.creator;
  delete org.creator;

  // distance formatting (meters → km)
  if (item.distance !== undefined && item.distance !== null) {
    const meters = Number(item.distance);
    if (Number.isFinite(meters)) {
      const km = meters / 1000;

      org.distance = {
        distance: Number(km.toFixed(2)),
        unit: "km",
      };
    }
  }
  if (org.operatingHours) {
    //add openNow check
    org.isOpenNow = isOrganizationOpenNow(
      org.operatingHours,
      timezone
    );

    // transform operating hours to local time
    org.operatingHours = transformOperatingHoursToLocal(
      org.operatingHours,
      timezone,
    );
  }
  delete org.operatingHours



  return org;
}


module.exports = { formatOrganization, formatNearByOrganization };
