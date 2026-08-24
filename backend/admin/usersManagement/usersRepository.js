// repositories/userRepository.js

const { User } = require("../../models/UserModel");

const { UserInterests } = require("../../models/UserInterests");
const { default: mongoose } = require("mongoose");

// Create
const createUser = async (data) => {
  const user = new Users(data);
  return await user.save();
};

// Get all with filters
const getUsersWithFilters = async (
  query,
  skip,
  limit,
  organization,
  sortBy = "createdAt",
  sortOrder = -1,
) => {
  const pipeline = [
    { $match: query },

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
                  { $in: ["$$userId", "$staff.user"] },
                ],
              },
            },
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
                      cond: { $eq: ["$$s.user", "$$userId"] },
                    },
                  },
                ],
              },
            },
          },
          { $project: { basicInfo: 1, staff: 1, creator: 1 } },
        ],
        as: "organizations",
      },
    },
    ...(organization
      ? [
          {
            $match: {
              "organizations._id": new mongoose.Types.ObjectId(organization),
            },
          },
        ]
      : []),

    // Optional: populate suppliers inside aggregation
    {
      $lookup: {
        from: "suppliers",
        localField: "companyDetails.suppliers",
        foreignField: "_id",
        as: "companyDetails.suppliers",
      },
    },
    {
      $lookup: {
        from: "userlogs",
        localField: "_id",
        foreignField: "user",
        as: "userlogs",
      },
    },
    {
      $addFields: {
        lastLogin: {
          $cond: [
            { $gt: [{ $size: "$userlogs" }, 0] },
            { $arrayElemAt: ["$userlogs.lastLogin", -1] },
            null,
          ],
        },
      },
    },

    // Lookup userglobalwallets
    {
      $lookup: {
        from: "userglobalwallets",
        localField: "_id", // Match the user._id with userglobalwallets.user
        foreignField: "user",
        as: "userglobalwallets",
      },
    },
    {
      $unwind: { path: "$userglobalwallets", preserveNullAndEmptyArrays: true },
    }, // Unwind userglobalwallets to access nested fields

    {
      $lookup: {
        from: "globalstatuslevels",
        localField: "userglobalwallets.global.level", // Access the 'level' array inside 'userglobalwallets'
        foreignField: "_id",
        as: "userglobalwallets.global.level",
      },
    },
    {
      $addFields: {
        // Convert 'level' array to an object by selecting the first element
        "userglobalwallets.global.level": {
          $arrayElemAt: ["$userglobalwallets.global.level", 0],
        },
      },
    },
    {
      $lookup: {
        from: "webhookevents",
        localField: "_id", // Match the user._id with webhookevents.user
        foreignField: "companyOrganizer", // Match the user's companyOrganizer with webhookevents
        pipeline: [
          { $project: { amount: 1 } }, // Select the relevant 'amount' field from webhookevents
        ],
        as: "webhookevents",
      },
    },

    // Calculate the sum of the 'amount' for each user using $reduce
    {
      $addFields: {
        totalAmount: {
          $reduce: {
            input: "$webhookevents", // Use the 'webhookevents' array
            initialValue: 0, // Start the sum at 0
            in: { $add: ["$$value", { $toDouble: "$$this.amount" }] }, // Add each 'amount' (convert to double if needed)
          },
        },
      },
    },
  ];
  if (sortBy) {
    const normalizedSortBy = sortBy?.trim().toLowerCase();

    if (normalizedSortBy === "name") {
      pipeline.push({
        $addFields: {
          fullName: {
            $concat: [
              { $ifNull: ["$firstName", ""] },
              " ",
              { $ifNull: ["$lastName", ""] },
            ],
          },
        },
      });

      sortBy = "fullName";
    } else if (normalizedSortBy === "username") {
      sortBy = "username";
    } else if (normalizedSortBy === "role") {
      sortBy = "accountState.userType";
    } else if (normalizedSortBy === "globalstatus") {
      sortBy = "userglobalwallets.global.level.title";
    } else if (normalizedSortBy === "status") {
      sortBy = "accountState.status";
    } else if (normalizedSortBy === "region") {
      sortBy = "timezone";
    } else if (normalizedSortBy === "lastlogin") {
      sortBy = "lastLogin";
    } else if (normalizedSortBy === "createdat") {
      sortBy = "createdAt";
    } else if (normalizedSortBy === "companyname") {
      sortBy = "companyDetails.name";
    }

    const direction =
      sortOrder === "asc" || sortOrder === 1 || sortOrder === "1" ? 1 : -1;

    pipeline.push({
      $sort: {
        [sortBy]: direction,
      },
    });
  }
  if (skip) {
    pipeline.push({ $skip: skip });
  }
  if (limit) {
    pipeline.push({ $limit: limit });
  }

  const users = await User.aggregate(pipeline).collation({
    locale: "en",
    strength: 2,
  });

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

// Find by ID with optional projection and populate suppliers and category
const findUserById = async (id, projection = null) => {
  // Prepare projection object if needed
  const proj = projection ? projection : {};

  // Find user and populate suppliers and category in companyDetails
  return User.findById(id, proj).populate([
    {
      path: "companyDetails.suppliers",
      model: "Suppliers",
    },
    {
      path: "companyDetails.category",
      model: "Categories",
    },
  ]);
};

const getUserDetailsForQRRepo = async (id) => {
  return User.findById(id).select(
    "profileIcon firstName lastName email phoneNumber",
  );
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
      tags: data.tags || [],
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
  return UserInterests.findOne({ user: userId });
};
const getActiveSubscription = async (userId) => {
  const user = await User.findById(new mongoose.Types.ObjectId(userId)).select(
    "activeSubscription.numberOfOrganizations",
  );
  if (!user) return 0;
  return user?.activeSubscription?.numberOfOrganizations || 0;
};
const getUserDetails = async (id) => {
  let data = await User.findById(id)
    .populate("companyDetails.suppliers")
    .populate("companyDetails.category");
  return data;
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
  getUserDetailsForQRRepo,
  getActiveSubscription,
  getUserDetails,
};
