const { getFullImageUrl } = require("../../../../helperUtils/imageHelper");
const {
  convertUtcToTimezone,
  convertUtcTimeToTimezone,
} = require("../../../../helperUtils/responseUtil");

function convertPromotionDates(promotion, timezone, format) {
    if (promotion.startDate && promotion.endDate && timezone) {
        promotion.startDate = convertUtcToTimezone(promotion.startDate, timezone, format);
        promotion.endDate = convertUtcToTimezone(promotion.endDate, timezone, format);
    }
}

function convertPromotionTimes(promotion, timezone) {
    if (promotion.startTime) {
        promotion.startTime = convertUtcTimeToTimezone(
            promotion.startTime,
            timezone,
            "HH:mm",
            "HH:mm",
        );
    }
    if (promotion.endTime) {
        promotion.endTime = convertUtcTimeToTimezone(
            promotion.endTime,
            timezone,
            "HH:mm",
            "HH:mm",
        );
    }
}

function formatPromotion(promotion, timezone) {
    const obj = { ...promotion };

    if (obj?.image) {
        obj.image = getFullImageUrl(obj.image);
    }

    if (obj?.companyOrganizer?.companyDetails?.logo) {
        obj.companyOrganizer.companyDetails.logo = getFullImageUrl(obj.companyOrganizer?.companyDetails?.logo);
    }

    if (obj?.tierLimit?.image) {
        obj.tierLimit.image = getFullImageUrl(obj.tierLimit.image);
    }

    convertPromotionTimes(obj, timezone);

    switch (obj.promotionType) {
        case "happyHour":
            delete obj.menuItem;
            delete obj.extraPoints;
            delete obj.discountedPrice;
            convertPromotionDates(obj, timezone, "YYYY-MM-DD");
            break;

        case "buyMenuItem":
        case "buyMenuItemPromotion":
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
