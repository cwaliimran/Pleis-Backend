// services/bannerControlsService.js
const { getGlobalPromotionsForHomeService } = require("../../globalLoyalty/promotions/promotionsService");
const { getPromotionsForHome } = require("../../loyalty/promotions/promotionsService");


const getLoyaltyAndGlobalLoyaltyPromotions = async ({ page, limit, userId, timezone }) => {

    let [loyaltyPromotions, globalLoyaltyPromotions] = await Promise.all([
        getPromotionsForHome({ page, limit, timezone }),
        getGlobalPromotionsForHomeService({
            userId,
            limit,
            skip: 0,
            timezone
        }),
    ]);

    const loyaltyItems =
        loyaltyPromotions?.promotions || [];

    const globalItems =
        globalLoyaltyPromotions?.responses || [];

    const data = [
        ...loyaltyItems.map(item => ({
            ...item,
            source: "loyalty"
        })),
        ...globalItems.map(item => ({
            ...item,
            source: "global"
        }))
    ];

    return data;

};

module.exports = {
    getLoyaltyAndGlobalLoyaltyPromotions,
};