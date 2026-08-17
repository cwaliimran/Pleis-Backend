const { getFullImageUrl } = require("../../../../helperUtils/imageHelper");
const {
  convertUtcToTimezone,
  convertUtcTimeToTimezone,
} = require("../../../../helperUtils/responseUtil");

// Helper function to handle date conversion
function convertPromotionDates(promotion, timezone, format) {
  if (promotion.startDate && promotion.endDate && timezone) {
    promotion.startDate = convertUtcToTimezone(
      promotion.startDate,
      timezone,
      format,
    );
    promotion.endDate = convertUtcToTimezone(
      promotion.endDate,
      timezone,
      format,
    );
  }
}

// utils/formatPromotion.js
function formatPromotion(promotion, timezone) {
  const obj = { ...promotion };

  // Attach full image URL
  if (obj?.image) {
    obj.image = getFullImageUrl(obj.image);
  }

  if (obj?.companyOrganizer?.profileIcon) {
    obj.companyOrganizer.profileIcon = getFullImageUrl(
      obj.companyOrganizer.profileIcon,
    );
  }

  if (obj?.tierLimit?.image) {
    obj.tierLimit.image = getFullImageUrl(obj.tierLimit.image);
  }

  delete obj.claimLimit;
  delete obj.recurringMeta;
  delete obj.recurringDetails;
  delete obj.tierLimit;
  delete obj.reward;
  delete obj.__v;

  // Convert promotion time slots
  if (obj.startTime) {
    obj.startTime = convertUtcTimeToTimezone(
      obj.startTime,
      timezone,
      "HH:mm",
      "HH:mm",
    );
  }

  if (obj.endTime) {
    obj.endTime = convertUtcTimeToTimezone(
      obj.endTime,
      timezone,
      "HH:mm",
      "HH:mm",
    );
  }

  // Adjust properties based on promotionType
  switch (obj.promotionType) {
    case "happyHour":
      delete obj.menuItem;
      delete obj.extraPoints;
      delete obj.discountedPrice;

      convertPromotionDates(obj, timezone, "YYYY-MM-DD hh:mm A");
      break;

    case "buyMenuItem":
    case "extraPointsForItem":
      delete obj.pointsMultiplier;
      delete obj.discountedPrice;

      convertPromotionDates(obj, timezone, "YYYY-MM-DD");
      break;

    case "productSale":
      delete obj.extraPoints;

      convertPromotionDates(obj, timezone, "YYYY-MM-DD");
      break;

    case "claimPromotion":
      delete obj.extraPoints;
      delete obj.discountedPrice;
      delete obj.menuItem;

      convertPromotionDates(obj, timezone, "YYYY-MM-DD");
      break;

    default:
      break;
  }

  obj.recurringDetails = obj?.recurringDetails || null;

  if (obj.recurringDetails?.endDate) {
    obj.recurringDetails.endDate = convertUtcToTimezone(
      obj.recurringDetails.endDate,
      timezone,
      "YYYY-MM-DD",
    );
  }

  return obj;
}

module.exports = formatPromotion;
