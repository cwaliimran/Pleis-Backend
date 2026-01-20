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
        obj.image = getFullImageUrl(obj.image);
    }
    if (obj?.companyOrganizer?.companyDetails?.logo) {
        obj.companyOrganizer.companyDetails.logo = getFullImageUrl(obj.companyOrganizer.companyDetails.logo);
    }

    if (obj?.tierLimit?.image) {
        obj.tierLimit.image = getFullImageUrl(obj.tierLimit.image);
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
    if (obj.recurringDetails && obj.recurringDetails.endDate) {
        obj.recurringDetails.endDate = convertUtcToTimezone(
            obj.recurringDetails.endDate,
            timezone,
            "YYYY-MM-DD"
        );
    }

    return obj;
}

module.exports = formatPromotion;
