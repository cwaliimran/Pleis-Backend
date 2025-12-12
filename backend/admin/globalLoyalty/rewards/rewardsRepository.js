const { GlobalReward, GlobalTicketReward, GlobalCustomReward } = require("../../../commonModules/globalLoyalty/rewards/models/reward");
const {formatReward} = require("./utils/formatReward");


const getModelByRewardType = (rewardType) => {
  // Normalize the rewardType to lowercase for comparison
  rewardType = rewardType.toLowerCase();

  switch (rewardType) {
    case "globalticketreward":
      console.log("enter", rewardType);
      return GlobalTicketReward;
    case "globalcustomreward":
      return GlobalCustomReward;
    default:
      console.warn(`Unexpected rewardType: ${rewardType}. Falling back to GlobalTicketReward.`);
      return GlobalTicketReward; // fallback model
  }
};



const create = async (data) => {
  try {
    // Normalize the rewardType to match the enum exactly
    let rewardType = data.rewardType;

    // Capitalize the first letter and make the rest lowercase for consistency
    rewardType = rewardType.charAt(0).toUpperCase() + rewardType.slice(1).toLowerCase();  
    data.rewardType = rewardType;  // Assign the normalized rewardType back to data

    // Get the correct model based on the normalized rewardType
    const Model = getModelByRewardType(data.rewardType);
    console.log("Using model:", Model); // To debug the model used

    const item = new Model(data);
    console.log("item", item); // To debug the item before saving

    await item.save();
    const formattedItem = formatReward(item.toObject(), null); // Clean object before returning
    return formattedItem;
  } catch (err) {
    console.error("Error creating reward:", err);
    throw err;
  }
};



// Get reward with population
const getWithFilters = async (query = {}, skip = 0, limit = 10) => {
  return GlobalReward.find(query)
    .populate("menuItem", "title")
    .populate({ path: "tierLimit", select: "title" })
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
