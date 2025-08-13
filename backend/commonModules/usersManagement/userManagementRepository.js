// repositories/usermanagementRepository.js
const { default: mongoose } = require("mongoose");
const { User } = require("../../models/UserModel");

// Create
const createUserManagement = async (data) => {
  const usermanagement = new UserManagements(data);
  return await usermanagement.save();
};

// Get usermanagements with filters
const getUserManagementsWithFilters = async (query = {}, skip = 0, limit = 10) => {
  return await User.aggregate([
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
const countUserManagements = async (query = {}) => {
  return User.countDocuments(query);
};

// Find by ID
const findUserManagementById = async (id) => {
  const usermanagements = await User.aggregate([
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
  return usermanagements[0] || null;
};

const findUserManagementDocById = async (id) => {
  return await User.findById(id);
};


// Delete
const deleteUserManagementById = async (usermanagement) => {
  return await usermanagement.deleteOne();
};

// Optional: keep this only for non-nested shallow updates
const findByIdAndUpdate = async (id, data) => {
  return User.findByIdAndUpdate(id, { $set: data }, { new: true });
};

// Find usermanagement by specific query
const findUserManagementByQuery = async (query) => {
  return await User.findOne(query);
};

module.exports = {
  createUserManagement,
  getUserManagementsWithFilters,
  countUserManagements,
  findUserManagementById,
  findUserManagementDocById,
  deleteUserManagementById,
  findByIdAndUpdate,
  findUserManagementByQuery
};
