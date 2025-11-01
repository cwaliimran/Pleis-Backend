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

    //attach full image URL
    if (obj?.image) {
        obj.media = getFullImageUrl(obj.image);
    }

    // Adjust obj properties based on promotionType
    switch (obj.promotionType) {
        case "happyHour":
            delete obj.menuItem;
            delete obj.extraPoints;
            delete obj.discountedPrice;
            convertPromotionDates(obj, timezone, "YYYY-MM-DD hh:mm A");
            break;

        case "buyMenuItem":
            delete obj.pointsMultiplier;
            delete obj.discountedPrice;
            convertPromotionDates(obj, timezone, "YYYY-MM-DD");
            break;

        case "productSale":
            delete obj.extraPoints;
            convertPromotionDates(obj, timezone, "YYYY-MM-DD");
            break;
    }

    return obj;
}

module.exports = formatPromotion;
