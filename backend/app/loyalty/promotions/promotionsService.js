const { buildKeywordQueryFromModels } = require("@dbUtils/queryUtil");
const { Promotion } = require("../../../commonModules/loyalty/promotions/models/Promotion");
const repository = require("./promotionsRepository");
const { generateMeta, getCurrentDateInTimezone } = require("@utils/responseUtil");
const formatPromotion = require("../../../commonModules/loyalty/promotions/utils/formatPromotion");


const getPromotions = async ({ page, limit, keyword, timezone }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const now = getCurrentDateInTimezone({ timezone });

  const pipeline = [
    {
      $match: {
        status: { $eq: "active" },
        endDate: { $gte: now },
      },
    },
  ];

  // 🔍 Keyword filter
  const keywordMatch = buildKeywordQueryFromModels(
    [{ schema: Promotion.schema }],
    keyword
  );
  if (Object.keys(keywordMatch).length) {
    pipeline.push({ $match: keywordMatch });
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


  pipeline.push({
    $unwind: {
      path: "$companyOrganizer",
      preserveNullAndEmptyArrays: true, // in case missing user
    },
  });

  // 🧩 Sort + pagination
  pipeline.push({ $sort: { createdAt: -1 } });
  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        ...(limit === 0 ? [] : [{ $limit: limit }]),
      ],
      totalFiltered: [{ $count: "count" }],
    },
  });

  const result = await Promotion.aggregate(pipeline);

  const records = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  const meta = generateMeta(page, limit, totalFiltered);

  // Optional: format promotion data
  const formatted = records.map((item) => formatPromotion(item, timezone));

  return { promotions: formatted, meta };
};



const getDetails = async (id) => {
  return await repository.findById(id);
};

module.exports = {
  getPromotions,
  getDetails,
};
