const { GlobalReward, GlobalTicketReward, GlobalCustomReward } = require("../../../commonModules/globalLoyalty/rewards/models/reward");
const formatReward = require("./utils/formatReward");


const getModelByRewardType = (rewardType) => {
  switch (rewardType) {
    case "globalTicketReward":
      return GlobalTicketReward;  
    case "globalCustomReward":
      return GlobalCustomReward;
    default:
      return GlobalTicketReward; // fallback model
  }
};



const create = async (data) => {
  try {
    // Get the correct model based on the normalized rewardType
    const Model = getModelByRewardType(data.rewardType);
    const item = new Model(data);


    await item.save();
    const formattedItem = formatReward(item.toObject(), null); // Clean object before returning
    return formattedItem;
  } catch (err) {

    throw err;
  }
};



// Get reward with population
const getWithFilters = async (query = {}, skip = 0, limit = 10) => {
  return GlobalReward.find(query)
    .populate("menuItem", "title")
    .populate("category", "title image")
    .populate({ path: "tierLimit", select: "title image" })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean()
    .exec();
};

// Count
const count = async (query = {}) => {
  return GlobalReward.countDocuments(query);
};

// Find by ID with population
const findById = async (id) => {
  return GlobalReward.findById(id)
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
  return GlobalReward.findByIdAndUpdate(id, data, { new: true })
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
