const {
  ClubMembers,
} = require("@ClubMembersModel");
const { getModelCounts } = require("../../../helperUtils/dbUtils/queryUtil");
const { default: mongoose } = require("mongoose");
const { generateMeta } = require("../../../helperUtils/responseUtil");
const { User } = require("@UserModel");
// Count
const countClubMembers = async (query = {}) => {
  return ClubMembers.countDocuments(query);
};
const countClubMembersOfOrganization = async (companyOrganizer) => {
  const companyOrganizerId = new mongoose.Types.ObjectId(companyOrganizer);
  return ClubMembers.countDocuments({ companyOrganizer: companyOrganizerId });
};

// Find by ID with population
const findClubMemberById = async (id) => {
  return ClubMembers.findById(id)
    .populate({
      path: "user",
      select: "firstName lastName username profileIcon"
    })
    .populate({
      path: "companyOrganizer",
      select: "firstName lastName username profileIcon"
    });
};

const getMembers = async (
  page = 1,
  limit = 10,
  keyword,
  status,
  companyOrganizer,
  date,
) => {

  let companyOrganizerIds = [];
  // If companyOrganizer provided, use it
  if (companyOrganizer) {
    companyOrganizerIds = [new mongoose.Types.ObjectId(companyOrganizer)];
  }

  // Pagination setup
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const pipeline = [
    {
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        as: "userData",
        pipeline: [
          {
            $project: {
              _id: 1,
              firstName: 1,
              lastName: 1,
              username: 1,
              timezone: 1,
              profileIcon: 1
            }
          }
        ]
      }
    },
    { $unwind: { path: "$userData", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "users",
        localField: "companyOrganizer",
        foreignField: "_id",
        as: "companyOrganizerData",
        pipeline: [
          {
            $project: {
              _id: 1,
              firstName: 1,
              lastName: 1,
              username: 1,
              profileIcon: 1
            }
          }
        ]
      }
    },
    { $unwind: { path: "$companyOrganizerData", preserveNullAndEmptyArrays: true } },
        {
      $lookup: {
        from: "tiers",
        localField: "level",
        foreignField: "_id",
        as: "level",
        pipeline: [
          {
            $project: {
              _id: 1,
              title: 1,
            }
          }
        ]
      }
    },
    { $unwind: { path: "$level", preserveNullAndEmptyArrays: true } }
  ];

  // Apply filters dynamically
  if (companyOrganizerIds.length > 0) {
    pipeline.push({
      $match: {
        companyOrganizer: { $in: companyOrganizerIds }
      }
    });
  }

  if (status) {
    pipeline.push({ $match: { status } });
  } else {
    pipeline.push({ $match: { status: { $ne: "deleted" } } });
  }

  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    pipeline.push({
      $match: { createdAt: { $gte: start, $lt: end } }
    });
  }

  // Keyword search across user and companyOrganizer fields
  if (keyword) {
    const regex = new RegExp(keyword, "i");
    pipeline.push({
      $match: {
        $or: [
          { "userData.firstName": regex },
          { "userData.lastName": regex },
          { "userData.username": regex },
          { "companyOrganizerData.firstName": regex },
          { "companyOrganizerData.lastName": regex },
          { "companyOrganizerData.username": regex }
        ]
      }
    });
  }

  // Sort, merge, clean
  pipeline.push({ $sort: { createdAt: -1 } });
  pipeline.push(
    { $addFields: { user: "$userData", companyOrganizer: "$companyOrganizerData" } },
    { $project: { userData: 0, companyOrganizerData: 0 } }
  );

  // Pagination + count
  pipeline.push({
    $facet: {
      data: [{ $skip: skip }, ...(limit === 0 ? [] : [{ $limit: limit }])],
      totalFiltered: [{ $count: "count" }]
    }
  });

  const result = await ClubMembers.aggregate(pipeline);
  const members = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Counts for meta
  const baseFilter =
    companyOrganizerIds.length > 0
      ? { companyOrganizer: { $in: companyOrganizerIds } }
      : {};

  // const counts = await getModelCounts({
  //   model: ClubMembers,
  //   filterQuery: baseFilter,
  //   statusMap: { status: ["active", "inactive"] },
  // });


  let meta = generateMeta(page, limit, totalFiltered);
  return {
    members,
    meta
  };
};

const getCounts = async (query) => {
  return getModelCounts({ model: ClubMembers, filterQuery: query });
};
//is club member
const isClubMember = async (userId, companyOrganizer) => {
  const member = await ClubMembers.findOne({
    user: userId,
    companyOrganizer,
    status: "active",
  });
  return !!member;
};

//get user joined clubs
const getUserJoinedClubs = async (userId) => {
  return ClubMembers.find({ user: userId, status: { $ne: "left" } }).select("companyOrganizer");
};


const giftPoints = async (companyOrganizer, user, points, notes ) => {
  try {
    const clubMember = await ClubMembers.findOne({ user, companyOrganizer });

    if (!clubMember) {
      throw new Error("Club member not found");
    }
    clubMember.points += points;

    // Save the updated club member
    await clubMember.save();

    return clubMember;
  } catch (error) {
    console.error("Error gifting points:", error);
    throw new Error("Failed to gift points");
  }
};
const getUserJoinedClubsall = async (userId) => {
  return ClubMembers.aggregate([
    {
      $match: { user: userId }  // Match the ClubMembers based on userId
    },
    {
      $lookup: {
        from: "users",  // Specify the Users collection to join
        localField: "companyOrganizer",  // Match the companyOrganizer field in ClubMembers
        foreignField: "_id",  // Match the _id field in the Users collection
        pipeline: [
          {
            $project: {
              _id: 1,
              "companyDetails.name": 1
            }
          }
        ],
        as: "companyOrganizer"  // Add the matched documents as companyOrganizerDetails
      }
    },
    {
      $unwind: {
        path: "$companyOrganizer",  // Flatten the companyOrganizerDetails array
        preserveNullAndEmptyArrays: true  // Keep the field if no match is found
      }
    },
    {
      $lookup: {
        from: "tiers",  // Specify the Tiers collection to join (this corresponds to your level field)
        localField: "level",  // Match the level field in ClubMembers with _id in Tiers
        foreignField: "_id",
        pipeline: [
          {
            $project: {
              _id: 1,
              title: 1,
            }
          }
        ],
        as: "level"  // Add the matched documents as levelDetails
      }
    },
    {
      $unwind: {
        path: "$level",  // Flatten the levelDetails array
        preserveNullAndEmptyArrays: true  // Keep the field if no match is found
      }
    },
    {
      $project: {
        companyOrganizer: "$companyOrganizer",  // Include the companyOrganizer details
        status: 1,  // Include the status field
        tierKey: 1,  // Include the tierKey field
        points: 1,  // Include the points field
        lifetimePoints: 1,  // Include the lifetimePoints field
        lastEvaluated: 1,  // Include the lastEvaluated field
        createdAt: 1,  // Include the createdAt field
        updatedAt: 1,  // Include the updatedAt field
        level: 1  // Include the level field from Tiers (Global Status Levels)
      }
    }
  ]);
};




// ==========================================================
// GET COMPANY LOYALTY SETTINGS (tier model + pointValuePercentage)
// ==========================================================
const getCompanyLoyaltyInfo = async (companyId) => {
  const company = await User.findById(companyId)
    .select("companyDetails.loyaltySettings.model companyDetails.loyaltySettings.pointValuePercentage");
  return {
    tierKey: company?.companyDetails?.loyaltySettings?.model || "essential",
    pointValuePercentage: company?.companyDetails?.loyaltySettings?.pointValuePercentage || 0
  };
};

module.exports = {
  countClubMembers,
  findClubMemberById,
  getMembers,
  isClubMember,
  getUserJoinedClubs,
  giftPoints,
  getCompanyLoyaltyInfo,
  getUserJoinedClubsall,
  countClubMembersOfOrganization
};