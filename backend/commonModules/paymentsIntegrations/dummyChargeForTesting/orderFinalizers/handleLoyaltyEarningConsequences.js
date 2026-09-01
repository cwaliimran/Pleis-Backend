const { resolveChallengeByTaskTypeService } = require("../../../../app/loyalty/challengesOrders/challengeOrdersService");
const { resolveGlobalChallengeByTaskTypeService } = require("../../../../app/globalLoyalty/challengesOrders/challengesOrdersService");
const { checkLoyaltyTierPromotion } = require("../../../../app/loyalty/clubMembers/clubMembersRepository");
const { checkPromotionGlobal } = require("../../../../app/userWalletService/global/walletManagement/userWalletRepository");
const { awardMenuItemPromotionsForOrder } = require("../../../../app/loyalty/promotions/promotionsRepository");

const collectPurchasedMenuItems = (menuOrder) => {
  const items = [];

  for (const item of menuOrder?.items || []) {
    if (!item?.menuItem || !item?.quantity) continue;
    items.push({
      menuItem: item.menuItem,
      quantity: Number(item.quantity),
    });
  }

  for (const combo of menuOrder?.combos || []) {
    const comboQty = Number(combo?.quantity) || 1;
    for (const item of combo?.items || []) {
      if (!item?.menuItem || !item?.quantity) continue;
      items.push({
        menuItem: item.menuItem,
        quantity: Number(item.quantity) * comboQty,
      });
    }
  }

  return items;
};

const handleLoyaltyEarningConsequences = ({
  userId,
  companyOrganizer,
  companyPoints,
  globalPoints,
  menuOrder
}) => {

  // 🔼 Tier Promotion
  if (companyPoints?.total > 0) {
    checkLoyaltyTierPromotion(userId, companyOrganizer)
      .then(() => {
      })
      .catch(err =>
        console.error("[LOYALTY] Tier promotion failed:", err)
      );
  }

  // 🌍 Global Promotion
  if (globalPoints?.total > 0) {
    checkPromotionGlobal(userId)
      .then(() => {
      })
      .catch(err =>
        console.error("[GLOBAL] Global promotion failed:", err)
      );
  }

  // 🎯 Buy Menu Item Challenge
  const items = collectPurchasedMenuItems(menuOrder);

  if (items.length) {
    awardMenuItemPromotionsForOrder({
      userId,
      companyOrganizer,
      menuOrder,
    })
      .then(() => {})
      .catch((err) =>
        console.error("[PROMOTION] Menu item promotion failed:", err)
      );

    resolveChallengeByTaskTypeService({
      userId,
      companyOrganizer,
      taskType: "buyMenuItem",
      items,
    })
      .then(() => {
      })
      .catch(err =>
        console.error("[CHALLENGE] Menu item challenge failed:", err)
      );
  }

  // 🎯 Company Earn Challenge
  if (companyPoints?.total > 0) {
    resolveChallengeByTaskTypeService({
      userId,
      companyOrganizer,
      taskType: "earnPoints",
      value: companyPoints.total,
    })
      .then(() => {
      })
      .catch(err =>
        console.error("[CHALLENGE] Company earn challenge failed:", err)
      );
  }

  // 🎯 Global Earn Challenge
  if (globalPoints?.total > 0) {
    resolveGlobalChallengeByTaskTypeService({
      userId,
      taskType: "globalEarnPoints",
      value: globalPoints.total,
    })
      .then(() => {
      })
      .catch(err =>
        console.error("[GLOBAL CHALLENGE] Global earn challenge failed:", err)
      );
  }
};

module.exports = { handleLoyaltyEarningConsequences };
