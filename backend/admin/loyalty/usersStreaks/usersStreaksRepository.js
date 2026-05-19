// repositories/usersStreakRepository.js
const UsersStreaks = require("@UsersStreaksModel");
const { getModelCounts } = require("@dbUtils/queryUtil");

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
//   sortBy = "createdAt",
//   sortOrder = "asc",
//   selectFields = null
// ) => {
//   const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };
//   const query = UsersStreaks.find(filter).populate({
//     path: 'user',
//     select: 'username firstName lastName email profileIcon',
//   }).sort(sort).lean();

//   if (selectFields) query.select(selectFields); // apply select dynamically
//   if (limit > 0) query.skip(skip).limit(limit);

//   return query.exec();
// };
const getUsersStreaksWithFilters = async (
  filter,
  skip,
  limit,
  sortBy = "createdAt",
  sortOrder = "asc",
  selectFields = null
) => {
  const sortDirection = sortOrder === "desc" ? -1 : 1;

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
              profileIcon: 1
            }
          }
        ]
      }
    },
    {
      $unwind: {
        path: "$user",
        preserveNullAndEmptyArrays: true
      }
    }
  ];

  if (sortBy === "userName") {
    pipeline.push(
      {
        $addFields: {
          userNameSort: {
            $toLower: {
              $ifNull: ["$user.username", ""]
            }
          }
        }
      },
      {
        $sort: {
          userNameSort: sortDirection,
          _id: -1
        }
      }
    );
  } else if (sortBy === "userFirstName") {
    pipeline.push(
      {
        $addFields: {
          userFirstNameSort: {
            $toLower: {
              $ifNull: ["$user.firstName", ""]
            }
          }
        }
      },
      {
        $sort: {
          userFirstNameSort: sortDirection,
          _id: -1
        }
      }
    );
  } else {
    pipeline.push({
      $sort: {
        createdAt: sortDirection,
        _id: sortDirection
      }
    });
  }

  if (limit > 0) {
    pipeline.push({ $skip: skip }, { $limit: limit });
  }

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

const getUSerStreaskBuOrganizerAndUser = async (companyOrganizer, user) => {
  return UsersStreaks.find({ companyOrganizer, user }).select('visits').lean().exec();
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
  getUSerStreaskBuOrganizerAndUser
};