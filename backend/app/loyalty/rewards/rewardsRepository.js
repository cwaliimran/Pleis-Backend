const mongoose = require("mongoose");
const MenuItems = require("@MenuItemsModel");
const {
  BuyMenuItemReward,
  TicketReward,
  CustomReward,
  Reward,
} = require("../../../commonModules/loyalty/rewards/models");
const { createRewardOrderService } = require("../rewardsOrders/rewardsOrdersService");
const { getActiveRewardEndDateQuery } = require("../../../commonModules/loyalty/rewards/utils/rewardEndDate");

const MENU_ITEM_POPULATE = "title image presetType creator";

const getMenuItemIdentityKey = (item) => {
  if (!item?.presetType || !item?.title) return null;
  return `${item.presetType}::${item.title}::${item.creator || ""}`;
};

const getRewardMenuItemId = (menuItem) => menuItem?._id || menuItem;

/**
 * Menu items that share presetType + title + creator count as the same
 * buyMenuItemReward product. Attaches equivalentMenuItems on each reward.
 */
const attachEquivalentMenuItemsToRewards = async (rewards = []) => {
  const buyMenuItemRewards = rewards.filter(
    (reward) => reward.rewardType === "buyMenuItemReward" && reward.menuItem
  );

  if (!buyMenuItemRewards.length) return rewards;

  const requestedIds = [
    ...new Set(buyMenuItemRewards.map((reward) => String(getRewardMenuItemId(reward.menuItem)))),
  ];

  const requestedItems = await MenuItems.find({ _id: { $in: requestedIds } })
    .select("_id title image presetType creator")
    .lean();

  const requestedById = new Map(requestedItems.map((item) => [String(item._id), item]));
  const identityGroups = new Map();

  for (const item of requestedItems) {
    const key = getMenuItemIdentityKey(item);
    if (!key) continue;
    if (!identityGroups.has(key)) identityGroups.set(key, []);
    identityGroups.get(key).push(item);
  }

  const siblingsByKey = new Map();

  if (identityGroups.size) {
    const siblingQueries = [...identityGroups.values()].map((group) => ({
      presetType: group[0].presetType,
      title: group[0].title,
      creator: group[0].creator,
    }));

    const siblings = await MenuItems.find({ $or: siblingQueries })
      .select("_id title image presetType creator")
      .lean();

    for (const sibling of siblings) {
      const key = getMenuItemIdentityKey(sibling);
      if (!key) continue;
      if (!siblingsByKey.has(key)) siblingsByKey.set(key, []);
      siblingsByKey.get(key).push(sibling);
    }
  }

  return rewards.map((reward) => {
    if (reward.rewardType !== "buyMenuItemReward" || !reward.menuItem) return reward;

    const menuItemId = String(getRewardMenuItemId(reward.menuItem));
    const requestedItem =
      (reward.menuItem && reward.menuItem._id ? reward.menuItem : null) ||
      requestedById.get(menuItemId);

    if (!requestedItem) return reward;

    const key = getMenuItemIdentityKey(requestedItem);
    const equivalentMenuItems = key
      ? siblingsByKey.get(key) || [requestedItem]
      : [requestedItem];

    return {
      ...reward,
      menuItem: requestedItem,
      equivalentMenuItems,
    };
  });
};

const populateRewardRelations = (query) =>
  query
    .populate("menuItem", MENU_ITEM_POPULATE)
    .populate("event", "basicInfo schedule")
    .populate("ticket")
    .populate("companyOrganizer", "companyDetails.logo companyDetails.loyaltySettings.title")
    .populate({ path: "tierLimit" });

// Get ALL rewards by company organizer (no pagination)
const getRewardsByCompanyOrganizer = async ({ companyOrganizer, timezone = "UTC" }) => {
  const query = {
    companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
    status: "active",
    ...getActiveRewardEndDateQuery(timezone),
  };

  const rewards = await populateRewardRelations(Reward.find(query))
    .sort({ createdAt: -1 })
    .lean();

  return attachEquivalentMenuItemsToRewards(rewards);
};

const claimReward = async (userId, rewardId, protectionUserDetails, timezone) => {
  const result = await createRewardOrderService(userId, rewardId, protectionUserDetails, timezone);
  return result;
};


/**
 * Fetch active rewards for dashboard (DB-level pagination)
 */
const getRewardsForDashboardPaged = async ({
  clubIds,
  skip,
  limit,
  keyword = "",
  timezone = "UTC",
}) => {
  const query = {
    companyOrganizer: { $in: clubIds },
    status: "active",
    isPromotionOnly: false,
    ...getActiveRewardEndDateQuery(timezone),
  };

  if (keyword) {
    query.$and = [
      {
        $or: [
          { title: { $regex: keyword, $options: "i" } },
          { description: { $regex: keyword, $options: "i" } },
        ],
      },
    ];
  }

  const rewards = await Reward.find(query)
    .populate("tierLimit")
    .populate("menuItem", MENU_ITEM_POPULATE)
    .populate("event", "basicInfo schedule")
    .populate("ticket")
    .populate(
      "companyOrganizer",
      "companyDetails.loyaltySettings.title companyDetails.logo"
    )
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  return attachEquivalentMenuItemsToRewards(rewards);
};


const countDashboardRewards = async ({ clubIds, keyword = "", timezone = "UTC" }) => {
  const query = {
    companyOrganizer: { $in: clubIds },
    status: "active",
    isPromotionOnly: false,
    ...getActiveRewardEndDateQuery(timezone),
  };

  if (keyword) {
    query.$and = [
      {
        $or: [
          { title: { $regex: keyword, $options: "i" } },
          { description: { $regex: keyword, $options: "i" } }
        ]
      }
    ];
  }

  return Reward.countDocuments(query);
};
const getRewardById = async (rewardId) => {
  const reward = await populateRewardRelations(Reward.findById(rewardId)).lean();
  if (!reward) return null;

  const [expanded] = await attachEquivalentMenuItemsToRewards([reward]);
  return expanded;
};


module.exports = {
  getRewardsByCompanyOrganizer,
  claimReward,
  getRewardsForDashboardPaged,
  countDashboardRewards,
  getRewardById,
};
