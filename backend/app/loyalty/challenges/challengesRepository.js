const {
  Challenge,
} = require("../../../commonModules/loyalty/challenges/models/Challenge");
const { default: mongoose } = require("mongoose");


// Get challenges with population
const getChallengesWithFilters = async (query = {}, skip = 0, limit = 10) => {
  return Challenge.find(query)
    .populate("taskMenuItem")
    .populate("reward.rewardMenuItem")
    .populate("tierLimit")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
};

// Count
const countChallenges = async (query = {}) => {
  return Challenge.countDocuments(query);
};

// Find by ID with population
const findChallengeById = async (id) => {
  return Challenge.findById(id)
    .populate("taskMenuItem")
    .populate("reward.rewardMenuItem")
    .populate("tierLimit");
};

const getChallengesByCompanyOrganizer = async ({
  companyOrganizer,
  skip,
  limit,
  keyword
}) => {

  const pipeline = [
    {
      $match: {
        companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
        status: "active",
        endDate: { $gte: new Date()}
      }
    }

  ];

  // Optional keyword search
  if (keyword) {
    const keywordMatch = buildKeywordQueryFromModels(
      [{ schema: Challenge.schema }],
      keyword
    );
    if (Object.keys(keywordMatch).length) {
      pipeline.push({ $match: keywordMatch });
    }
  }

  // Populate organizer minimal info
  pipeline.push({
    $lookup: {
      from: "users",
      localField: "companyOrganizer",
      foreignField: "_id",
      as: "companyOrganizer",
      pipeline: [
        {
          $project: {
            "companyDetails.name": 1,
            firstName: 1,
            profileIcon: 1,
          },
        },
      ],
    },
  });

  pipeline.push({
    $unwind: {
      path: "$companyOrganizer",
      preserveNullAndEmptyArrays: true
    }
  });

  // Populate tierLimit
  pipeline.push({
    $lookup: {
      from: "tiers",
      localField: "tierLimit",
      foreignField: "_id",
      as: "tierLimit"
    }
  });

  pipeline.push({
    $unwind: {
      path: "$tierLimit",
      preserveNullAndEmptyArrays: true
    }
  });

  // Sort by newest
  pipeline.push({ $sort: { createdAt: -1 } });

  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        ...(limit === 0 ? [] : [{ $limit: limit }])
      ],
      totalFiltered: [
        { $count: "count" }
      ]
    }
  });

  const result = await Challenge.aggregate(pipeline);
  return {
    challenges: result[0]?.data || [],
    totalFiltered: result[0]?.totalFiltered[0]?.count || 0
  };
};


module.exports = {
  getChallengesWithFilters,
  countChallenges,
  findChallengeById,
  getChallengesByCompanyOrganizer
};
