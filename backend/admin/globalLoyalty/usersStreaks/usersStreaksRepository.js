// repositories/usersStreakRepository.js
const UsersStreaks = require("@UsersStreaksModel");
const { getModelCounts } = require("@dbUtils/queryUtil");
const Organizations = require('@OrganizationModel');

// Create
// Create usersStreak and automatically assign next order
const createUsersStreak = async (data) => {
  const usersStreak = new UsersStreaks(data);
  return await usersStreak.save();
};

// Get all with filters, sorted by 'order' ascending and then 'createdAt' descending
// const getUsersStreaksWithFilters = async (
//   filter,
//   skip,
//   limit,
//   sortBy,
//   sortOrder,
//   orderSort = "asc",
//   selectFields = null

// ) => {
//   const query = UsersStreaks.find(filter).populate({
//     path: 'user',
//     select: 'username firstName lastName email profileIcon',
//   }).sort({ [sortBy]: sortOrder === "desc" ? -1 : 1 }).lean();

//   // Apply select fields dynamically if provided
//   if (selectFields) query.select(selectFields);

//   // Apply pagination (skip and limit)
//   if (limit > 0) query.skip(skip).limit(limit);

//   // Execute the query
//   return query.exec();
// };
const getUsersStreaksWithFilters = async (
  filter,
  skip = 0,
  limit = 10,
  sortBy = "createdAt",
  sortOrder = "desc",
  selectFields = null
) => {
  const sortDirection = sortOrder === "asc" ? 1 : -1;

  const pipeline = [
    { $match: filter },

    {
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        as: "user",
        pipeline: [
          {
            $project: {
              username: 1,
              firstName: 1,
              lastName: 1,
              email: 1,
              profileIcon: 1,
            },
          },
        ],
      },
    },
    {
      $unwind: {
        path: "$user",
        preserveNullAndEmptyArrays: true,
      },
    },
  ];

  if (sortBy === "userName") {
    pipeline.push(
      {
        $addFields: {
          userNameSort: {
            $toLower: {
              $ifNull: ["$user.username", ""],
            },
          },
        },
      },
      {
        $sort: {
          userNameSort: sortDirection,
          _id: -1,
        },
      }
    );
  } else if (sortBy === "userFirstName") {
    pipeline.push(
      {
        $addFields: {
          userFirstNameSort: {
            $toLower: {
              $ifNull: ["$user.firstName", ""],
            },
          },
        },
      },
      {
        $sort: {
          userFirstNameSort: sortDirection,
          _id: -1,
        },
      }
    );
  } else {
    pipeline.push({
      $sort: {
        createdAt: sortDirection,
        _id: sortDirection,
      },
    });
  }

  pipeline.push({ $skip: skip });

  if (limit > 0) {
    pipeline.push({ $limit: limit });
  }

  pipeline.push({
    $project: {
      userNameSort: 0,
      userFirstNameSort: 0,
    },
  });

  return UsersStreaks.aggregate(pipeline);
};
// Count by condition
const countUsersStreaks = async (query = {}) => {
  return UsersStreaks.countDocuments(query);
};

const getUsersStreaksCounts = async (query) => {
  return getModelCounts({ model: UsersStreaks, filterQuery: query });
}

// Find by ID
const findUsersStreakById = async (id) => {
  return UsersStreaks.findById(id).populate('user').populate('companyOrganizer');
};

// Update and save
const updateUsersStreakData = async (usersStreak, data) => {
  Object.assign(usersStreak, data);
  return await usersStreak.save();
};

// Delete
const deleteUsersStreakById = async (usersStreak) => {
  return await usersStreak.deleteOne();
};

//findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  return UsersStreaks.findByIdAndUpdate(id, data, { new: true }).populate('user').populate('companyOrganizer');
};






const attachOrganizationDetailsToStreaks = async (streaks) => {
  if (!streaks || streaks.length === 0) return [];

  const organizerIds = [...new Set(streaks.map(s => s.companyOrganizer?.toString()))];

  const organizers = await Organizations.find(
    { creator: { $in: organizerIds } },
    'creator basicInfo.name basicInfo.media.logo'
  ).lean();

  const organizerMap = {};
  organizers.forEach(org => {
    organizerMap[org.creator?.toString()] = {
      name: org.basicInfo?.name || '',
      logo: org.basicInfo?.media?.logo || ''
    };
  });

  return streaks.map(streak => {
    const orgId = streak.companyOrganizer?.toString();
    const orgDetails = organizerMap[orgId] || { name: '', logo: '' };

    return {
      ...streak,
      organizationName: orgDetails.name,
      organizationLogo: orgDetails.logo
    };
  });
};






module.exports = {
  createUsersStreak,
  getUsersStreaksWithFilters,
  countUsersStreaks,
  findUsersStreakById,
  updateUsersStreakData,
  deleteUsersStreakById,
  findByIdAndUpdate,
  getUsersStreaksCounts,
  attachOrganizationDetailsToStreaks
};