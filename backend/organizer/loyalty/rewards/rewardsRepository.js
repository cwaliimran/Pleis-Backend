const {
  BuyMenuItemReward,
  TicketReward,
  CustomReward,
  Reward,
} = require("../../../commonModules/loyalty/rewards/models");
const { formatReward } = require("./utils/formatReward");
const { RewardsOrders } = require("@LoyaltyRewardsOrdersModel");
const { cache, invalidate } = require("@redisCache");
const ACTIVE_LOYALTY_REWARDS_CACHE_KEY = "loyaltyRewards:active";
const buildLoyaltyRewardsCacheKey = ({
  user,
  skip = 0,
  limit = 10
}) => {
  return `${ACTIVE_LOYALTY_REWARDS_CACHE_KEY}:${user}:skip=${skip}:limit=${limit}`;
};
const invalidateLoyaltyRewardsCache = async () => {
  await invalidate(`${ACTIVE_LOYALTY_REWARDS_CACHE_KEY}:${user}`);
};
 
// Decide which discriminator model to use
const getModelByrewardType = (rewardType) => {
  switch (rewardType) {

    case "buyMenuItemReward":
      return BuyMenuItemReward;
    case "ticketReward":
      return TicketReward;
    case "customReward":
      return CustomReward;
    default:
      return BuyMenuItemReward; // fallback
  }
};

// Create reward
const create = async (data) => {
  try {
    await invalidate(ACTIVE_LOYALTY_REWARDS_CACHE_KEY);
   await invalidateLoyaltyRewardsCache(data.companyOrganizer);
    const Model = getModelByrewardType(data.rewardType);
    const item = new Model(data);
    await item.save();
    // Clean up the Mongoose properties before returning
    const formattedItem = formatReward(item.toObject(), null);  // Pass the clean object here
    return formattedItem;
  } catch (err) {
    throw err;
  }
};

// Get reward with population
const getWithFilters = async (query = {}, skip = 0, limit = 10) => {
  return Reward.find(query)
    .populate("menuItem")
    .populate({ path: "tierLimit", select: "image title" })
    .select("title image")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean()
    .exec();
};

// Count
const count = async (query = {}) => {
  return Reward.countDocuments(query);
};

// Find by ID with population
const findById = async (id) => {
  return Reward.findById(id)
    .populate("menuItem")
    .populate({ path: "tierLimit", select: "image title" })
    .exec();
};

// Update and save
const updateData = async (item, data) => {
  await invalidateLoyaltyRewardsCache(data.companyOrganizer);
  Object.assign(item, data);
  return await item.save();
};

// Delete
const deleteItem = async (item) => {
  return await item.deleteOne();
};

// findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  const existingReward = await Reward.findById(id)
  await invalidateLoyaltyRewardsCache(existingReward.companyOrganizer);
  return Reward.findByIdAndUpdate(id, data, { new: true })
    .populate("menuItem")
    .populate("tierLimit");
};

// repository.redeemReward
const redeemReward = async (bookingId, userId) => {
  const rewardOrder = await RewardsOrders.findOne({ bookingId }).lean();

  if (!rewardOrder) {
    return {
      success: false,
      translationKey: "reward_not_found",
      statusCode: 404,
    };
  }

  if (rewardOrder.status == "expired") {
    return {
      success: false,
      translationKey: "reward_order_expired",
      statusCode: 400,
      data: {
        status: rewardOrder.status,
        redeemedAt: rewardOrder.redeemedAt,
      },
    };
  }
  if (rewardOrder.status == "completed") {
    return {
      success: false,
      translationKey: "reward_already_redeemed",
      statusCode: 400,
      data: {
        status: rewardOrder.status,
        redeemedAt: rewardOrder.redeemedAt,
      },
    };
  }

  // Update doc
  const updated = await RewardsOrders.findOneAndUpdate(
    { bookingId },
    {
      status: "completed",
      redeemedAt: new Date(),
      redeemedBy: userId,
    },
    { new: true }
  ).lean();

  return {
    success: true,
    translationKey: "reward_redeemed_successfully",
    data: {
      status: updated.status,
      redeemedAt: updated.redeemedAt,
    },
  };
};



module.exports = {
  redeemReward,
  create,
  getWithFilters,
  count,
  findById,
  updateData,
  deleteItem,
  findByIdAndUpdate,
};
