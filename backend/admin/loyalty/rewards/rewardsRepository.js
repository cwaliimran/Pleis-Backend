const {
  BuyMenuItemReward,
  TicketReward,
  CustomReward,
  Reward,
} = require("../../../commonModules/loyalty/rewards/models");
const formatReward = require("./utils/formatReward");

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
    console.log("data",data );
    const Model = getModelByrewardType(data.rewardType);
    console.log("model", Model);
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
  return await item.save();
};

// Delete
const deleteItem = async (item) => {
  return await item.deleteOne();
};

// findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
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
