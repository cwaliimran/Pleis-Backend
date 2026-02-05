const {
  GlobalBasePromotion,
} = require("../../../commonModules/globalLoyalty/promotions/models/Promotion");


const getWithFilters = async (query, skip = 0, limit = 20) => {
  const pipeline = [
    { $match: query },
    { $sort: { createdAt: -1 } },
    { $skip: skip },
  ];

  if (limit > 0) pipeline.push({ $limit: limit });

  // Reward lookup for globalClaimPromotion from globalrewards collection
  pipeline.push({
    $lookup: {
      from: "globalrewards",
      localField: "reward",
      foreignField: "_id",
      as: "reward"
    }
  });

  // Reward lookup again for more detailed data from globalrewards collection
  pipeline.push({
    $lookup: {
      from: "globalrewards",         // Same collection for detailed data
      localField: "reward",          // Using the joined field from the first lookup
      foreignField: "_id",           // Matching based on the _id of globalrewards
      as: "rewardDetails"            // Store result in rewardDetails
    }
  });

  // Menu item lookup
  pipeline.push({
    $lookup: {
      from: "menuitems",
      localField: "menuItem",
      foreignField: "_id",
      as: "menuItem"
    }
  });

  // Tier limit lookup
  pipeline.push({
    $lookup: {
      from: "globalstatuslevels",
      localField: "tierLimit",
      foreignField: "_id",
      as: "tierLimit"
    }
  });

  // Flatten arrays into their respective single object fields
  pipeline.push({
    $addFields: {
      reward: { $arrayElemAt: ["$reward", 0] },          // Flatten reward array
      rewardDetails: { $arrayElemAt: ["$rewardDetails", 0] },  // Flatten rewardDetails array
      menuItem: { $arrayElemAt: ["$menuItem", 0] },      // Flatten menuItem array
      tierLimit: { $arrayElemAt: ["$tierLimit", 0] },    // Flatten tierLimit array
    }
  });

  // Return the aggregated data
  return await GlobalBasePromotion.aggregate(pipeline).allowDiskUse(true);
};


module.exports = {
  getWithFilters,
};


// Count
const count = async (query = {}) => {
  return GlobalBasePromotion.countDocuments(query);
};

// Find by ID with population
const findById = async (id) => {
  return GlobalBasePromotion.findById(id)
    .populate("menuItem")
    .populate({ path: "tierLimit", select: "image title" }).exec();
};


module.exports = {
  getWithFilters,
  count,
  findById,
};
