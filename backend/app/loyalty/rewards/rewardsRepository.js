const mongoose = require("mongoose");
const {
  BuyMenuItemReward,
  TicketReward,
  CustomReward,
  Reward,
} = require("../../../commonModules/loyalty/rewards/models");
const { createRewardOrderService } = require("../rewardsOrders/rewardsOrdersService");
const { getActiveRewardEndDateQuery } = require("../../../commonModules/loyalty/rewards/utils/rewardEndDate");


// Get ALL rewards by company organizer (no pagination)
const getRewardsByCompanyOrganizer = async ({ companyOrganizer, timezone = "UTC" }) => {
  const query = {
    companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
    status: "active",
    ...getActiveRewardEndDateQuery(timezone),
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
  return Reward.findById(rewardId).lean();
}


module.exports = {
  getRewardsByCompanyOrganizer,
  claimReward,
  getRewardsForDashboardPaged,
  countDashboardRewards,
  getRewardById,
};
