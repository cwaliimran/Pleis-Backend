// repositories/userRepository.js

const { User } = require("../../models/UserModel");

const { UserInterests } = require("../../models/UserInterests");

// Create
const createUser = async (data) => {
  const user = new Users(data);
  return await user.save();
};

// Get all with filters
const getUsersWithFilters = async (query, skip, limit) => {
  const users = await User.aggregate([
    { $match: query },
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    ...(limit > 0 ? [{ $limit: limit }] : []),

    // Lookup organizations where user is creator or staff
    {
      $lookup: {
        from: "organizations",
        let: { userId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $or: [
                  { $eq: ["$creator", "$$userId"] },
                  { $in: ["$$userId", "$staff.user"] }
                ]
              }
            }
          },
          // Filter staff: if creator, keep all staff, else only this user
          {
            $addFields: {
              staff: {
                $cond: [
                  { $eq: ["$creator", "$$userId"] },
                  "$staff",
                  {
                    $filter: {
                      input: "$staff",
                      as: "s",
                      cond: { $eq: ["$$s.user", "$$userId"] }
                    }
                  }
                ]
              }
            }
          },
          { $project: { basicInfo: 1, staff: 1, creator: 1 } }
        ],
        as: "organizations"
      }
    },

    // Optional: populate suppliers inside aggregation
    {
      $lookup: {
        from: "suppliers",
        localField: "companyDetails.suppliers",
        foreignField: "_id",
        as: "companyDetails.suppliers"
      }
    }
  ]);

  return users;
};

//Get all staff and managers with filters
const getStaffWithFilters = async (query, skip, limit) => {
  return User.aggregate([
    { $match: query },
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    ...(limit > 0 ? [{ $limit: limit }] : []),

    // Lookup organizations the user belongs to (as creator or staff)
    {
      $lookup: {
        from: "organizations",
        let: { userId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $or: [
                  { $eq: ["$creator", "$$userId"] },
                  { $in: ["$$userId", "$staff.user"] },
                ],
              },
              status: { $ne: "deleted" },
            },
          },
          { $project: { basicInfo: 1, staff: 1, creator: 1 } },
        ],
        as: "organizations",
      },
    },

    // Lookup suppliers if needed
    {
      $lookup: {
        from: "suppliers",
        localField: "companyDetails.suppliers",
        foreignField: "_id",
        as: "companyDetails.suppliers",
      },
    },
  ]);
};



// Count by condition
const countUsers = async (query = {}) => {
  return User.countDocuments(query);
};

// Find by ID with optional projection and populate suppliers
const findUserById = async (id, projection = null) => {
  // Prepare projection object if needed
  const proj = projection ? projection : {};

  // Find user and populate suppliers
  return User.findById(id, proj).populate({
    path: "companyDetails.suppliers",
    model: "Suppliers"
  });
};

//get user by id and and select only _id and verify if exists
const findUserByIdAndCheckExists = async (id) => {
  return await User.findById(id).select("_id");
};

// Update and save
const updateUserData = async (user, data) => {
  Object.assign(user, data);
  return await user.save();
};

// Delete
const deleteUserById = async (user) => {
  return await user.deleteOne();
};

//findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  return User.findByIdAndUpdate(id, data, { new: true });
};

/**
 * Update user's 2FA secret and status
 */
const updateTwoFA = async (userId, data) => {
  return User.findByIdAndUpdate(userId, data, { new: true });
};

const updateUserInterests = async (userId, data) => {
  let userInterests = await UserInterests.findOne({ user: userId });
  if (userInterests) {
    // Update existing
    userInterests.categories = data.categories || userInterests.categories;
    userInterests.venueTypes = data.venueTypes || userInterests.venueTypes;
    userInterests.tags = data.tags || userInterests.tags;
  } else {
    // Create new
    userInterests = new UserInterests({
      user: userId,
      categories: data.categories || [],
      venueTypes: data.venueTypes || [],
      tags: data.tags || []
    });
  }
  return await userInterests.save();
};

//get user interests by userId and populate references
const getUserInterestsByUserId = async (userId) => {
  return UserInterests.findOne({ user: userId })
    .populate("categories")
    .populate("venueTypes")
    .populate("tags");
};

//get user interests by userId and populate references
const getUserInterestsIdsForRecommendation = async (userId) => {
  return UserInterests.findOne({ user: userId })
};

//get company pickup options
const getInAppOrderingSettings = async (companyId) => {
  const company = await User.findById(companyId).select("companyDetails.inAppOrderingSettings");
  return company?.companyDetails?.inAppOrderingSettings || [];
};

module.exports = {
  createUser,
  getUsersWithFilters,
  getStaffWithFilters,
  countUsers,
  findUserById,
  updateUserData,
  deleteUserById,
  findByIdAndUpdate,
  updateTwoFA,
  updateUserInterests,
  getUserInterestsByUserId,
  getUserInterestsIdsForRecommendation,
  findUserByIdAndCheckExists,
  getInAppOrderingSettings
};
