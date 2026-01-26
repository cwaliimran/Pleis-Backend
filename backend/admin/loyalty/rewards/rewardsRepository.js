const {
  BuyMenuItemReward,
  TicketReward,
  CustomReward,
  Reward,
} = require("../../../commonModules/loyalty/rewards/models");
const formatReward = require("./utils/formatReward");
const { cache, invalidate } = require("@redisCache");
const ACTIVE_LOYALTY_REWARD_CACHE_KEY = "loyaltyReward:active";
const buildLoyaltyRewardCacheKey = ({
  scope = "public", // public | admin
  skip = 0,
  limit = 10
}) => {
  return `${ACTIVE_LOYALTY_REWARD_CACHE_KEY}:${scope}:skip=${skip}:limit=${limit}`;
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
    const Model = getModelByrewardType(data.rewardType);
    const item = new Model(data);
    await item.save();
    await invalidate(ACTIVE_LOYALTY_REWARD_CACHE_KEY);
    // Clean up the Mongoose properties before returning
    const formattedItem = formatReward(item.toObject(), null);  // Pass the clean object here
    return formattedItem;
  } catch (err) {
    throw err;
  }
};

// Get reward with population
const getWithFilters = async (query = {}, skip = 0, limit = 10) => {
    const cacheKey = buildLoyaltyRewardCacheKey({
    scope: "admin",
    skip,
    limit,
  });
  return cache({
    namespace: cacheKey,
    ttl: 86400, // 1 day
 
    fetchFn: async () => {
 
  return Reward.find(query)
    .populate({
      path: "menuItem",
      select: "title menu",
      populate: {
        path: "menu",
        select: "title"
      }
    })
    .populate({
      path: "tierLimit",
      select: "title"
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean()
    .exec();
    },
  });
};

// Count
const count = async (query = {}) => {
  return Reward.countDocuments(query);
};

// Find by ID with population
const findById = async (id) => {
  return Reward.findById(id)
    .populate("menuItem")
    .populate({path:"tierLimit", select: "image title" })
    .exec();
};

// Update and save
const updateData = async (item, data) => {
  Object.assign(item, data);
  await invalidate(ACTIVE_LOYALTY_REWARD_CACHE_KEY);
  return await item.save();
};

// Delete
const deleteItem = async (item) => {
  await invalidate(ACTIVE_LOYALTY_REWARD_CACHE_KEY);
  return await item.deleteOne();
};

// findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  await invalidate(ACTIVE_LOYALTY_REWARD_CACHE_KEY);
  return Reward.findByIdAndUpdate(id, data, { new: true })
    .populate("menuItem")
    .populate("tierLimit");
};

module.exports = {
  create,
  getWithFilters,
  count,
  findById,
  updateData,
  deleteItem,
  findByIdAndUpdate,
};
