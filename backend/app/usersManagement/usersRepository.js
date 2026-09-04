// repositories/userRepository.js

const { User } = require("../../models/UserModel");

const { UserInterests } = require("../../models/UserInterests");
const { cache, invalidate } = require("@redisCache");

const USER_INTERESTS_CACHE_KEY = "user:interests";

const buildUserInterestsCacheKey = (userId) =>
  `${USER_INTERESTS_CACHE_KEY}:${userId}`;

// Create
const createUser = async (data) => {
  const user = new User(data);
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

// Find by ID with optional projection and populate suppliers
const findAppUserByIdWithProjection = async (id, projection = null) => {
  // Prepare projection object if needed
  const proj = projection ? projection : {};
  // Find user and populate suppliers
  return User.findById(id, proj).lean();
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
  const cacheKey = buildUserInterestsCacheKey(userId);

  let userInterests = await UserInterests.findOne({ user: userId });

  if (userInterests) {
    userInterests.categories = data.categories || userInterests.categories;
    userInterests.venueTypes = data.venueTypes || userInterests.venueTypes;
    userInterests.tags = data.tags || userInterests.tags;
  } else {
    userInterests = new UserInterests({
      user: userId,
      categories: data.categories || [],
      venueTypes: data.venueTypes || [],
      tags: data.tags || []
    });
  }

  const result = await userInterests.save();

  // manual invalidation
  await invalidate(cacheKey);

  return result;
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
  const cacheKey = buildUserInterestsCacheKey(userId);

  return cache({
    namespace: cacheKey,
    ttl: null,
    fetchFn: async () => {
      const interests = await UserInterests.findOne({ user: userId })
        .select("categories venueTypes tags")
        .lean();

      return interests || {
        categories: [],
        venueTypes: [],
        tags: []
      };
    },
  });
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
  findAppUserByIdWithProjection
};
