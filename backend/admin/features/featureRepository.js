// repositories/featureRepository.js
const { Features } = require("./Feature");
const { default: mongoose } = require("mongoose");

// Create
const createFeature = async (data) => {
  const feature = new Features(data);
  return await feature.save();
};

// Get features with filters
const getFeaturesWithFilters = async (query = {}, skip = 0, limit = 10) => {
  return await Features.aggregate([
    { $match: query },
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: limit },
    // {
    //   $lookup: {
    //     from: "users",
    //     localField: "creator",
    //     foreignField: "_id",
    //     as: "creatorInfo"
    //   }
    // },
    // {
    //   $addFields: {
    //     creator: { $arrayElemAt: ["$creatorInfo", 0] }
    //   }
    // },
    {
      $project: {
        title: 1,
        key: 1,
        status: 1,
        creator: {
          _id: 1,
          name: 1,
        },
        createdAt: 1,
        updatedAt: 1
      }
    }
  ]);
};


// Count by condition
const countFeatures = async (query = {}) => {
  return Features.countDocuments(query);
};

// Find by ID
const findFeatureById = async (id) => {
  const features = await Features.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(id) } },
    // {
    //   $lookup: {
    //     from: "users",
    //     localField: "creator",
    //     foreignField: "_id",
    //     as: "creatorInfo"
    //   }
    // },
    // {
    //   $addFields: {
    //     creator: { $arrayElemAt: ["$creatorInfo", 0] }
    //   }
    // },
    {
      $project: {
        title: 1,
        key: 1,
        status: 1,
        creator: {
          _id: 1,
          email: 1
        },
        createdAt: 1,
        updatedAt: 1
      }
    }
  ]);
  return features[0] || null;
};

const findFeatureDocById = async (id) => {
  return await Features.findById(id);
};


// Delete
const deleteFeatureById = async (feature) => {
  return await feature.deleteOne();
};

// Optional: keep this only for non-nested shallow updates
const findByIdAndUpdate = async (id, data) => {
  return Features.findByIdAndUpdate(id, { $set: data }, { new: true });
};

// Find feature by specific query
const findFeatureByQuery = async (query) => {
  return await Features.findOne(query);
};

module.exports = {
  createFeature,
  getFeaturesWithFilters,
  countFeatures,
  findFeatureById,
  findFeatureDocById,
  deleteFeatureById,
  findByIdAndUpdate,
  findFeatureByQuery
};
