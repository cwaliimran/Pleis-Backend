const { resolveChallengeByTaskTypeService } = require("../../../../app/loyalty/challengesOrders/challengeOrdersService");
const { resolveGlobalChallengeByTaskTypeService } = require("../../../../app/globalLoyalty/challengesOrders/challengesOrdersService");
const { checkLoyaltyTierPromotion } = require("../../../../app/loyalty/clubMembers/clubMembersRepository");
const { checkPromotionGlobal } = require("../../../../app/userWalletService/global/walletManagement/userWalletRepository");

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
        console.log(`[LOYALTY] Tier promotion check completed for user ${userId}`);
      })
      .catch(err =>
        console.error("[LOYALTY] Tier promotion failed:", err)
      );
  }

  // 🌍 Global Promotion
  if (globalPoints?.total > 0) {
    checkPromotionGlobal(userId)
      .then(() => {
        console.log(`[GLOBAL] Global promotion check completed for user ${userId}`);
      })
      .catch(err =>
        console.error("[GLOBAL] Global promotion failed:", err)
      );
  }

  // 🎯 Buy Menu Item Challenge
  if (menuOrder?.items?.length) {
    const items = menuOrder.items
      .filter(i => i?.menuItem)
      .map(i => i.menuItem);

    if (items.length) {
      resolveChallengeByTaskTypeService({
        userId,
        companyOrganizer,
        taskType: "buyMenuItem",
        items,
      })
        .then(() => {
          console.log(`[CHALLENGE] buyMenuItem resolved for user ${userId}`);
        })
        .catch(err =>
          console.error("[CHALLENGE] Menu item challenge failed:", err)
        );
    }
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
        console.log(`[CHALLENGE] Company earnPoints resolved for user ${userId}`);
      })
      .catch(err =>
        console.error("[CHALLENGE] Company earn challenge failed:", err)
      );
  }

  // 🎯 Global Earn Challenge
  if (globalPoints?.total > 0) {
    resolveGlobalChallengeByTaskTypeService({
      userId,
      taskType: "earnPoints",
      value: globalPoints.total,
    })
      .then(() => {
        console.log(`[GLOBAL CHALLENGE] earnPoints resolved for user ${userId}`);
      })
      .catch(err =>
        console.error("[GLOBAL CHALLENGE] Global earn challenge failed:", err)
      );
  }
};

module.exports = { handleLoyaltyEarningConsequences };
