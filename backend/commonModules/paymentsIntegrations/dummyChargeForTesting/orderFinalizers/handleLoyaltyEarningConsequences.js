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

  const items = collectPurchasedMenuItems(menuOrder);

  // Run challenge side-effects sequentially — parallel completions write the same
  // club wallet and abort each other's Mongo transactions (TransientTransactionError).
  void (async () => {
    try {
      if (items.length) {
        await awardMenuItemPromotionsForOrder({
          userId,
          companyOrganizer,
          menuOrder,
        }).catch((err) =>
          console.error("[PROMOTION] Menu item promotion failed:", err)
        );

        await resolveChallengeByTaskTypeService({
          userId,
          companyOrganizer,
          taskType: "buyMenuItem",
          items,
        });
      }

      if (companyPoints?.total > 0) {
        await resolveChallengeByTaskTypeService({
          userId,
          companyOrganizer,
          taskType: "earnPoints",
          value: companyPoints.total,
        });
      }

      if (globalPoints?.total > 0) {
        await resolveGlobalChallengeByTaskTypeService({
          userId,
          taskType: "globalEarnPoints",
          value: globalPoints.total,
        });
      }
    } catch (err) {
      console.error("[CHALLENGE] Loyalty challenge side effects failed:", err);
    }
  })();
};

module.exports = { handleLoyaltyEarningConsequences };
