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

  // Organizer image
  if (obj?.companyOrganizer?.profileIcon) {
    obj.companyOrganizer.profileIcon = getFullImageUrl(obj.companyOrganizer.profileIcon);
  }

  // Tier image
  if (obj?.tierLimit?.image) {
    obj.tierLimit.image = getFullImageUrl(obj.tierLimit.image);
  }
  if (obj?.reward?.customReward?.image) {
    obj.reward.customReward.image = getFullImageUrl(obj.reward.customReward.image);
  }



  // ---------------- Promotion Type Cases ----------------
  switch (obj.promotionType) {
    case "globalHappyHourPromotion":
      convertPromotionDates(obj, timezone, "YYYY-MM-DD hh:mm A");
      break;

    case "globalClaimPromotion":
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
