const { buildKeywordQueryFromModels } = require("@utils/dbUtils/queryUtil");
const SupportRequest = require("@SupportRequestModel");
const { generateMeta } = require("@utils/responseUtil");
const { User } = require("@UsersModel");
const { formatUpdate } = require("./helper/helper");


const getSupportRequest = async ({ timezone, page, limit, keyword, status, userId, date, skip, sortBy="createdAt", sortOrder="desc" }) => {

  const sortDirection = sortOrder === "asc" ? 1 : -1;
  const pipeline = [];

  // Status filter
  if (status) {
    pipeline.push({ $match: { status } });
  } else {
    pipeline.push({ $match: { status: { $ne: "deleted" } } });
  }

  // Date filter
  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    pipeline.push({
      $match: {
        createdAt: { $gte: start, $lt: end }
      }
    });
  }

  // Lookup user details and unwind
  pipeline.push({
    $lookup: {
      from: 'users',
      localField: 'user', 
      foreignField: '_id',
      pipeline: [
        { $project: { firstName: 1, lastName: 1, username: 1, email: 1, profileIcon: 1 } }
      ],
      as: 'user',
    },
  });

  pipeline.push({
    $unwind: {
      path: '$user',
      preserveNullAndEmptyArrays: true,
    },
  });

  // Keyword search
  if (keyword) {
    pipeline.push({
      $match: {
        $or: [
          { subject: { $regex: keyword, $options: 'i' } },
          { message: { $regex: keyword, $options: 'i' } },
          { 'user.firstName': { $regex: keyword, $options: 'i' } },
          { 'user.lastName': { $regex: keyword, $options: 'i' } },
        ],
      },
    });
  }

  // --- Add userName sort field if requested ---
  if (sortBy === "userName") {
    pipeline.push({
      $addFields: {
        userNameSort: {
          $toLower: {
            $concat: [
              { $ifNull: ["$user.firstName", ""] },
              " ",
              { $ifNull: ["$user.lastName", ""] }
            ]
          }
        }
      }
    });
    pipeline.push({ $sort: { userNameSort: sortDirection, _id: -1 } });
  } else {
    // Default sort
    pipeline.push({ $sort: { createdAt: sortDirection, _id: -1 } });
  }

  // Pagination and counting
  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        ...(limit === 0 ? [] : [{ $limit: limit }])
      ],
      totalFiltered: [{ $count: "count" }]
    }
  });

  // Execute aggregation
  const result = await SupportRequest.aggregate(pipeline);

  let supportRequests = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  const [total, active, inactive] = await Promise.all([
    SupportRequest.countDocuments({ ...(userId && { userId: userId }), status: { $ne: "deleted" } }),
    SupportRequest.countDocuments({ status: "active", ...(userId && { userId: userId }) }),
    SupportRequest.countDocuments({ status: "inactive", ...(userId && { userId: userId }) })
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.supportRequestsCount = { total, active, inactive };

  const formattedSupportRequests = supportRequests.map(formatUpdate);

  return { supportRequests: formattedSupportRequests, meta };
};
module.exports = {
  getSupportRequest
};