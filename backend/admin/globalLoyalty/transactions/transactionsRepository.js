const { getModelCounts } = require("@dbUtils/queryUtil");
const { default: mongoose } = require("mongoose");
const  {GlobalWalletTransactions}  = require("@GlobalWalletTransactionsModel");



const getCGlobalWalletTransactionsWithFilters = async (
  query = {},
  skip = 0,
  limit = 10,
  keyword = null
) => {
  const pipeline = [
    { $match: query },

    // Populate user
    {
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        pipeline: [
          {
            $project: {
              firstName: 1,
              lastName: 1,
            }
          }
        ],
        as: "user"
      }
    },
    { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
  ];

  // ----------------------------------------
  // KEYWORD FILTER AFTER LOOKUP
  // ----------------------------------------
if (keyword) {
  const regex = new RegExp(keyword, "i");

  // Try converting the keyword into a number
  let numericKeyword = Number(keyword);
  if (isNaN(numericKeyword)) numericKeyword = null;

  pipeline.push({
    $match: {
      $or: [
        { description: regex },
        { objectType: regex },
        { type: regex },
        { objectId: regex },
        { "user.firstName": regex },
        { "user.lastName": regex },
        ...(numericKeyword !== null
          ? [{ "points.total": numericKeyword }]
          : [])
      ]
    }
  });
}


  // sorting + pagination
  pipeline.push({ $sort: { createdAt: -1 } });
  pipeline.push({ $skip: skip });
  pipeline.push({ $limit: limit });

  return GlobalWalletTransactions.aggregate(pipeline);
};




module.exports = {
  getCGlobalWalletTransactionsWithFilters
};