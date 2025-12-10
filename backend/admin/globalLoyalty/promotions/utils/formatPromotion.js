const { getFullImageUrl } = require("../../../../helperUtils/imageHelper");
const { convertUtcToTimezone } = require("../../../../helperUtils/responseUtil");

// Helper function to handle date conversion
function convertPromotionDates(promotion, timezone, format) {
    if (promotion.startDate && promotion.endDate && timezone) {
        promotion.startDate = convertUtcToTimezone(promotion.startDate, timezone, format);
        promotion.endDate = convertUtcToTimezone(promotion.endDate, timezone, format);
    }
}

// utils/formatPromotion.js
function formatPromotion(promotion, timezone) {
  const obj = { ...promotion };

  // Attach full image URL for promotion
  if (obj?.image) {
    obj.image = getFullImageUrl(obj.image);
  }

  // Attach full image URL for reward
  if (obj?.reward?.image) {
    obj.reward.image = getFullImageUrl(obj.reward.image);
  }

  // -------- CLEAN rewardType --------
  if (obj?.reward?.globalRewardType) {
    let cleanType = obj.reward.globalRewardType.replace("Global", "");

    // lower case first letter
    cleanType = cleanType.charAt(0).toLowerCase() + cleanType.slice(1);

    obj.reward.rewardType = cleanType; // e.g., "customReward"
    delete obj.reward.globalRewardType;
  }

  // -------- CLEAN promotionType --------
  if (obj?.globalPromotionType) {
    let cleanPromo = obj.globalPromotionType.replace("global", "");

    cleanPromo = cleanPromo.charAt(0).toLowerCase() + cleanPromo.slice(1);

    obj.promotionType = cleanPromo; // e.g., "claimPromotion"
    delete obj.globalPromotionType;
  } else if (obj?.promotionType?.startsWith("global")) {
    // when promotionType already contains global prefix
    let cleanPromo = obj.promotionType.replace("global", "");
    cleanPromo = cleanPromo.charAt(0).toLowerCase() + cleanPromo.slice(1);
    obj.promotionType = cleanPromo;
  }

  // Organizer image
  if (obj?.companyOrganizer?.profileIcon) {
    obj.companyOrganizer.profileIcon = getFullImageUrl(obj.companyOrganizer.profileIcon);
  }

  // Tier image
  if (obj?.tierLimit?.image) {
    obj.tierLimit.image = getFullImageUrl(obj.tierLimit.image);
  }

  // ---------------- Promotion Type Cases ----------------
  switch (obj.promotionType) {
    case "happyHour":
      delete obj.menuItem;
      delete obj.extraPoints;
      delete obj.discountedPrice;
      convertPromotionDates(obj, timezone, "YYYY-MM-DD hh:mm A");
      break;

    case "buyMenuItemPromotion":
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
  }

  // Recurring details
  obj.recurringDetails = obj?.recurringDetails || null;

  if (obj.recurringDetails?.endDate) {
    obj.recurringDetails.endDate = convertUtcToTimezone(
      obj.recurringDetails.endDate,
      timezone,
      "YYYY-MM-DD"
    );
  }

  return obj;
}

module.exports = formatPromotion;
