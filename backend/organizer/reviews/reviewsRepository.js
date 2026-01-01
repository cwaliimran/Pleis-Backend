const mongoose = require('mongoose');
const Reviews = require('@ReviewsModel'); // Adjust path to your Reviews model
const { formatReviewData } = require('./formatters/updateFormatter');

const getReviews = async (data) => {
  try {
    // Log the received data to check parameters
    console.log("Received data:", data);

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
        { 'firstName': { $regex: data.keyword, $options: 'i' } },  // Match keyword in user's first name
        { 'lastName': { $regex: data.keyword, $options: 'i' } },   // Match keyword in user's last name
        { 'location.fullAddress': { $regex: data.keyword, $options: 'i' } },  // Match keyword in user's full address
        { 'basicInfo.name': { $regex: data.keyword, $options: 'i' } },  // Match keyword in organization's name
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
                avgRating: 1,
                ratingCounts: { 
                  $arrayToObject: {
                    $map: {
                      input: { $range: [1, 6] }, // Ratings from 1 to 5
                      as: "rating",
                      in: [
                        { $toString: "$$rating" },  // Convert rating to string
                        { $size: { $filter: { input: "$ratingCounts", as: "item", cond: { $eq: ["$$item.rating", "$$rating"] } } } },
                      ]
                    }
                  }
                }
              },
            },
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

    // Log the reviews returned by the aggregation
    console.log("Aggregated Result:", result);

    // If no reviews are found, log that no reviews matched
    if (!result || result.length === 0) {
      console.log("No reviews found for the given filters.");
    }

    // Unwind reviews and apply the formatReviewData function to each review
    const formattedReviews = result.flatMap(doc => doc.reviews.map(review => formatReviewData(review)));


    return {
      data: formattedReviews || [], // All reviews with filtered user/organization data
      meta: result[0]?.meta || { totalCount: 0, avgRating: 0, ratingCounts: {} }, // Metadata with total count, avg rating, and rating counts
    };
  } catch (err) {
    // Log the error for debugging
    console.error("Error fetching reviews:", err);
    throw err;
  }
};

module.exports = {
  getReviews,
};
