const challengeRepo = require("./challengesRepository");
const { generateMeta, getCurrentDateInTimezone } = require("@utils/responseUtil");
const { Challenge } = require("../../../commonModules/loyalty/challenges/models/Challenge");
const { buildKeywordQueryFromModels } = require("../../../helperUtils/dbUtils/queryUtil");
const formatChallenge = require("../../../commonModules/loyalty/challenges/formatters/formatChallenge");


const getChallenges = async ({ page, limit, timezone, keyword }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const now = getCurrentDateInTimezone({ timezone });


  const pipeline = [
    {
      $match: {
        status: { $eq: "active" },
        endDate: { $gte: now }
      }
    }
  ];

  if (keyword) {
    const keywordMatch = buildKeywordQueryFromModels([{ schema: Challenge.schema }], keyword);
    if (Object.keys(keywordMatch).length) {
      pipeline.push({ $match: keywordMatch });
    }
  }

  // 🔗 Populate companyOrganizer (Users)
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

  // ✅ Convert array → single object
  pipeline.push({
    $unwind: {
      path: "$companyOrganizer",
      preserveNullAndEmptyArrays: true, // keep null if not found
    },
  });

  pipeline.push({ $sort: { createdAt: -1 } });

  pipeline.push({
    $facet: {
      data: [{ $skip: skip }, ...(limit === 0 ? [] : [{ $limit: limit }])],
      totalFiltered: [{ $count: "count" }],
    },
  });

  const result = await Challenge.aggregate(pipeline);

  const challenges = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  const meta = generateMeta(page, limit, totalFiltered);
  const formattedChallenges = challenges.map(challenge => formatChallenge(challenge, timezone));


  return { challenges: formattedChallenges, meta };
};

const getChallengeDetails = async (id) => {
  return await challengeRepo.findChallengeById(id);
};

module.exports = {
  getChallenges,
  getChallengeDetails,
};
