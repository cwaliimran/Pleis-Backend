const mongoose = require('mongoose');
const Reviews = require('@ReviewsModel'); // Adjust path to your Reviews model
const { formatReviewData } = require('./formatters/updateFormatter');
const Organizations = require('@OrganizationModel');
const { generateMeta } = require('@utils/responseUtil');

const getOrganizationIdsByOrganizerId = async (organizerId) => {
  try {

    if (!organizerId) {
      throw new Error("OrganizerId is required.");
    }
    const organizations = await Organizations.aggregate([
      {
        $match: {
          creator: new mongoose.Types.ObjectId(organizerId),
        },
      },
      {
        $project: {
          _id: 1,
        },
      },
    ]);
    if (!organizations || organizations.length === 0) {

      return [];

    }
    const organizationIds = organizations.map(org => org._id);
    return organizationIds;

  } catch (err) {
    throw err;
  }
};







const getReviews = async (data) => {
  try {
    if (!data.organization || !Array.isArray(data.organization) || data.organization.length === 0) {
      data.organization = await getOrganizationIdsByOrganizerId(data.organizer);
    }


    // Convert organization IDs from string to ObjectId
    const organizationObjectIds = data.organization.map(id => new mongoose.Types.ObjectId(id));

    // Build the base aggregation pipeline
    const pipeline = [
      {
        $match: {
          organization: { $in: organizationObjectIds },  // Match organization from the provided list
          status: 'active',  // Only consider active reviews
        },
      },
      {
        $lookup: {
          from: 'users',  // The collection to join (Users collection)
          localField: 'user',  // The field in reviews that contains the user ID
          foreignField: '_id',  // The field in the Users collection to match against
          pipeline: [
            {
              $project: {
                firstName: 1,  // Include firstName
                lastName: 1,   // Include lastName
                profileIcon: 1, // Include profileIcon
                location: 1,   // Include location
              },
            }
          ],
          as: 'userDetails',
        },
      },
      {
        $unwind: "$userDetails",  // Unwind userDetails array
      },
      {
        $lookup: {
          from: 'organizations',  // The collection to join (Organizations collection)
          localField: 'organization',  // The field in reviews that contains the organization ID
          foreignField: '_id',  // The field in the Organizations collection to match against
          pipeline: [
            {
              $project: {
                basicInfo: 1,  // Include firstName
              },
            }
          ],
          as: 'organizationDetails',
        },
      },
      {
        $unwind: "$organizationDetails",  // Unwind organizationDetails array
      },

      // Only apply keyword matching if a keyword is provided
      ...(data.keyword ? [
        {
          $match: {
            $or: [
              { comment: { $regex: data.keyword, $options: 'i' } },  // Match keyword in the comment
              { 'userDetails.firstName': { $regex: data.keyword, $options: 'i' } },  // Match keyword in user's first name
              { 'userDetails.lastName': { $regex: data.keyword, $options: 'i' } },   // Match keyword in user's last name
              { 'userDetails.location.fullAddress': { $regex: data.keyword, $options: 'i' } },  // Match keyword in user's full address
              { 'organizationDetails.basicInfo.name': { $regex: data.keyword, $options: 'i' } },  // Match keyword in organization's name
            ],
          },
        }
      ] : []),


      {
        $facet: {
          reviews: [
            { $skip: 0 }, // Skipping and limiting can be added for pagination if needed
            { $limit: 100 }, // You can adjust this as per your requirements
          ],
          meta: [
            {
              $group: {
                _id: null,
                totalCount: { $sum: 1 },  // Count of total reviews
                avgRating: { $avg: "$rating" },  // Calculate average rating
                ratingCounts: {
                  $push: {
                    rating: "$rating",  // Push the rating
                  },
                },
              },
            },
            {
              $project: {
                _id: 0,
                totalCount: 1,
                avgRating: { $round: ["$avgRating", 1] },

                distribution: {
                  $map: {
                    input: { $reverseArray: { $range: [1, 6] } }, // 👈 5 → 1
                    as: "star",
                    in: {
                      stars: "$$star",

                      count: {
                        $size: {
                          $filter: {
                            input: "$ratingCounts",
                            as: "item",
                            cond: { $eq: ["$$item.rating", "$$star"] }
                          }
                        }
                      },

                      percentage: {
                        $cond: [
                          { $eq: ["$totalCount", 0] },
                          0,
                          {
                            $round: [
                              {
                                $multiply: [
                                  {
                                    $divide: [
                                      {
                                        $size: {
                                          $filter: {
                                            input: "$ratingCounts",
                                            as: "item",
                                            cond: { $eq: ["$$item.rating", "$$star"] }
                                          }
                                        }
                                      },
                                      "$totalCount"
                                    ]
                                  },
                                  100
                                ]
                              },
                              0
                            ]
                          }
                        ]
                      }
                    }
                  }
                }
              }
            }
            ,
          ],
        },
      },
      {
        $unwind: "$meta",
      },
      {
        $project: {
          reviews: 1,
          meta: 1,
        },
      },
    ];

    // Execute the aggregation pipeline
    const result = await Reviews.aggregate(pipeline);
    console.log("result",result );
    const formattedReviews =
      result[0]?.reviews?.map(review => formatReviewData(review)) || [];
    const totalFiltered = result[0]?.reviews?.length || 0;
    console.log("formattedReviews",data.page );
    const meta = generateMeta(Number(data.page), Number(data.limit), totalFiltered);
    meta.avgRating = result[0]?.meta?.avgRating || 0;
    meta.totalCount = result[0]?.meta?.totalCount || 0;
    meta.distribution = result[0]?.meta?.distribution || [];
    console.log("meta",meta );

    return {
      reviews: formattedReviews,
      meta: {
        ...meta
      },
    };
  } catch (err) {
    throw err;
  }
};





const findReviewById = async (id) => {
  return Reviews.findById(id);
};
const findByIdAndUpdate = async (id, data) => {
  return Reviews.findByIdAndUpdate(id, data, { new: true });
};


const getRatingsByEventIdService = async (eventId, limit = 10, page = 1, keyword) => {
  try {
    const safeLimit = Number(limit) || 10;
    const safePage = Number(page) || 1;
    const skip = safeLimit === 0 ? 0 : (safePage - 1) * safeLimit;

    const pipeline = [
      {
        $match: {
          event: new mongoose.Types.ObjectId(eventId),
          status: "active",
        },
      },

      // 🔹 User lookup
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
                profileIcon: 1,
                location: 1,
              },
            },
          ],
          as: "userDetails",
        },
      },
      {
        $unwind: {
          path: "$userDetails",
          preserveNullAndEmptyArrays: true,
        },
      },

      // 🔹 Organization lookup (REQUIRED by formatReviewData)
      {
        $lookup: {
          from: "organizations",
          localField: "organization",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                basicInfo: 1,
              },
            },
          ],
          as: "organizationDetails",
        },
      },
      {
        $unwind: {
          path: "$organizationDetails",
          preserveNullAndEmptyArrays: true,
        },
      },

      // 🔹 Optional keyword filter
      ...(keyword
        ? [
          {
            $match: {
              $or: [
                { comment: { $regex: keyword, $options: "i" } },
                { "userDetails.firstName": { $regex: keyword, $options: "i" } },
                { "userDetails.lastName": { $regex: keyword, $options: "i" } },
                { "userDetails.location.fullAddress": { $regex: keyword, $options: "i" } },
                { "organizationDetails.basicInfo.name": { $regex: keyword, $options: "i" } },
              ],
            },
          },
        ]
        : []),

      // 🔹 Facet: paginated reviews + rating summary
      {
        $facet: {
          reviews: [
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            ...(safeLimit ? [{ $limit: safeLimit }] : []),
          ],

          meta: [
            {
              $group: {
                _id: null,
                totalCount: { $sum: 1 },
                avgRating: { $avg: "$rating" },
                ratings: { $push: "$rating" },
              },
            },
            {
              $project: {
                _id: 0,
                totalCount: 1,
                avgRating: { $round: ["$avgRating", 1] },

                distribution: {
                  $map: {
                    input: { $reverseArray: { $range: [1, 6] } }, // ⭐ 5 → 1
                    as: "star",
                    in: {
                      stars: "$$star",
                      count: {
                        $size: {
                          $filter: {
                            input: "$ratings",
                            as: "r",
                            cond: { $eq: ["$$r", "$$star"] },
                          },
                        },
                      },
                      percentage: {
                        $cond: [
                          { $eq: ["$totalCount", 0] },
                          0,
                          {
                            $round: [
                              {
                                $multiply: [
                                  {
                                    $divide: [
                                      {
                                        $size: {
                                          $filter: {
                                            input: "$ratings",
                                            as: "r",
                                            cond: { $eq: ["$$r", "$$star"] },
                                          },
                                        },
                                      },
                                      "$totalCount",
                                    ],
                                  },
                                  100,
                                ],
                              },
                              0,
                            ],
                          },
                        ],
                      },
                    },
                  },
                },
              },
            },
          ],
        },
      },

      { $unwind: "$meta" },
    ];

    const result = await Reviews.aggregate(pipeline);

    const formattedReviews =
      result[0]?.reviews?.map(review => formatReviewData(review)) || [];
    const totalFiltered = result[0]?.reviews?.length || 0;
    const meta = generateMeta(page, limit, totalFiltered);
    meta.avgRating = result[0]?.meta?.avgRating || 0;
    meta.totalCount = result[0]?.meta?.totalCount || 0;
    meta.distribution = result[0]?.meta?.distribution || [];


    return {
      reviews: formattedReviews,
      meta: {
        ...meta,
        currentPage: safePage,
        limit: safeLimit,
      },
    };
  } catch (err) {
    throw err;
  }
};


module.exports = {
  getReviews,
  findReviewById,
  findByIdAndUpdate,
  getRatingsByEventIdService
};