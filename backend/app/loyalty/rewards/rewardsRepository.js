const mongoose = require("mongoose");
const {
  BuyMenuItemReward,
  TicketReward,
  CustomReward,
  Reward,
} = require("../../../commonModules/loyalty/rewards/models");
const { createRewardOrderService } = require("../rewardsOrders/rewardsOrdersService");


// Get rewards by company organizer
// Get ALL rewards by company organizer (no pagination)
const getRewardsByCompanyOrganizer = async ({ companyOrganizer }) => {
  const now = new Date();
  const query = {
    companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
    status: "active",
    $or: [
      { endDate: null },
      { endDate: { $gt: now } }
    ]
  };

  return Reward.find(query)
    .populate("menuItem", "title image")
    .populate({ path: "tierLimit" })
    .sort({ createdAt: -1 })
    .lean();
};


// Count rewards by organizer
const countRewardsByCompanyOrganizer = async ({ companyOrganizer, status }) => {
  const query = {
    companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
  };

  if (status) query.status = status;
  else query.status = { $ne: "deleted" };

  return Reward.countDocuments(query);
};

const claimReward = async (userId, rewardId) => {
  const result = await createRewardOrderService(userId, rewardId);
  return result;
};


/**
 * Fetch active rewards for dashboard (DB-level pagination)
 */
const getRewardsForDashboardPaged = async ({
  clubIds,
  now,
  skip,
  limit
}) => {
  return Reward.find({
    companyOrganizer: { $in: clubIds },
    status: "active",
    $or: [
      { endDate: null },
      { endDate: { $gt: now } }
    ]
  })
    .populate("tierLimit")
    .populate("menuItem", "title image")
    .populate(
      "companyOrganizer",
      "companyDetails.loyaltySettings.title companyDetails.logo"
    )
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
};

const countDashboardRewards = async ({ clubIds, now }) => {
  return Reward.countDocuments({
    companyOrganizer: { $in: clubIds },
    status: "active",
    $or: [
      { endDate: null },
      { endDate: { $gt: now } }
    ]
  });
};


module.exports = {
  getRewardsByCompanyOrganizer,
  countRewardsByCompanyOrganizer,
  claimReward,
  getRewardsForDashboardPaged,
  countDashboardRewards
};
