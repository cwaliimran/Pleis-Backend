const { getFullImageUrl } = require("../../../../helperUtils/imageHelper");
const {
    convertUtcToTimezone,
    convertUtcTimeToTimezone,
} = require("../../../../helperUtils/responseUtil");

function convertPromotionDates(promotion, timezone, format) {
    if (timezone) {
        if (promotion.startDate) {
            promotion.startDate = convertUtcToTimezone(promotion.startDate, timezone, format);
        }
        if (promotion.endDate) {
            promotion.endDate = convertUtcToTimezone(promotion.endDate, timezone, format);
        }
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

function formatPromotion(promotion, timezone, tierKey) {
    let obj = { ...promotion };

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

        case "buyMenuItemPromotion":
        case "extraPointsForItem":
            delete obj.pointsMultiplier;
            delete obj.discountedPrice;
            if (Array.isArray(obj.menuItem)) {
                obj.menuItem.forEach(item => {
                    if (item && typeof item === "object" && item._id) {
                        item.image = getFullImageUrl(item?.image);
                    }
                });
            } else if (obj.menuItem && typeof obj.menuItem === "object" && obj.menuItem._id) {
                obj.menuItem.image = getFullImageUrl(obj.menuItem?.image);
            }
   
            convertPromotionDates(obj, timezone, "YYYY-MM-DD");
            break;

        case "productSale":
            delete obj.extraPoints;
             // obj.menuItem.image = getFullImageUrl(obj.menuItem?.image);
             if (Array.isArray(obj.menuItem)) {
                 obj.menuItem.forEach(item => {
                     item.image = getFullImageUrl(item?.image);
                 });
             } else if (obj.menuItem && typeof obj.menuItem === "object") {
                 obj.menuItem.image = getFullImageUrl(obj.menuItem?.image);
             }
    
            convertPromotionDates(obj, timezone, "YYYY-MM-DD");
            break;
        case "claimPromotion":
            delete obj.extraPoints;
            delete obj.discountedPrice;
            delete obj.menuItem;
            obj.reward.image= getFullImageUrl(obj.reward?.image);
            convertPromotionDates(obj, timezone, "YYYY-MM-DD");
            break;
            
        case  "globalHappyHourPromotion":
            delete obj.menuItem;
            delete obj.extraPoints;
            convertPromotionDates(obj, timezone, "YYYY-MM-DD hh:mm A");
            break;
        case "globalClaimPromotion":
            delete obj.extraPoints;
            delete obj.discountedPrice;
            delete obj.menuItem;
            obj.reward.image= getFullImageUrl(obj.reward?.image);
            convertPromotionDates(obj, timezone, "YYYY-MM-DD hh:mm A");
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

    if (tierKey) {
        obj = formatSinglePromotionByTierKey(obj, tierKey);
    }

    return obj;
}

function formatSinglePromotionByTierKey(item, tierKey) {
    if (!tierKey || !item?.tierLimit) return item;

    const { essential, preferred, premier, ...restTier } = item.tierLimit;
    const current = item.tierLimit[tierKey];

    item.tierLimit = {
        ...restTier,
        entryPoints: current?.entryPoints ?? null,
        retainPoints: current?.retainPoints ?? null,
    };

    delete item.tierLimit.createdAt;
    delete item.tierLimit.updatedAt;
    delete item.tierLimit.status;
    delete item.tierLimit.__v;

    return item;
}

module.exports = formatPromotion;
