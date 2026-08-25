const mongoose = require("mongoose");
const {
  BuyMenuItemReward,
  TicketReward,
  CustomReward,
  Reward,
} = require("../../../commonModules/loyalty/rewards/models");
const { createRewardOrderService } = require("../rewardsOrders/rewardsOrdersService");
const { getStartAndEndOfDay } = require("../../../helperUtils/responseUtil");


// Get ALL rewards by company organizer (no pagination)
const getRewardsByCompanyOrganizer = async ({ companyOrganizer, timezone = "UTC" }) => {
  const { start, end } = getStartAndEndOfDay(new Date(), timezone);
  // Include no-expiry rewards plus those ending today or later (exclude past)
  const query = {
    companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
    status: "active",
    $or: [
      { endDate: null },
      { endDate: { $gte: start } }
    ]
  };

  return Reward.find(query)
    .populate("menuItem", "title image")
    .populate("event", "basicInfo schedule")
    .populate("ticket")
    .populate("companyOrganizer", "companyDetails.logo companyDetails.loyaltySettings.title")
    .populate({ path: "tierLimit" })
    .sort({ createdAt: -1 })
    .lean();
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
  now,
  skip,
  limit,
  keyword = "",
  timezone
}) => {
  const query = {
    companyOrganizer: { $in: clubIds },
    status: "active",
    isPromotionOnly: false, // Exclude promotion-only rewards
    $or: [
      { endDate: null },
      { endDate: { $gt: now } },
    ],
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

  return Reward.find(query)
    .populate("tierLimit")
    .populate("menuItem", "title image")
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
};


const countDashboardRewards = async ({ clubIds, now, keyword = "" }) => {
  const query = {
    companyOrganizer: { $in: clubIds },
    status: "active",
    isPromotionOnly: false, // Exclude promotion-only rewards
    $or: [
      { endDate: null },
      { endDate: { $gt: now } }
    ]
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
  return Reward.findById(rewardId).lean();
}


module.exports = {
  getRewardsByCompanyOrganizer,
  claimReward,
  getRewardsForDashboardPaged,
  countDashboardRewards,
  getRewardById,
};
