const Reviews = require('@ReviewsModel'); // Adjust path to your PromoCode model
const mongoose = require('mongoose');
const formatLoyaltyListing = require('./formater/formateImage');
const { sendUserNotifications } = require('../../controllers/communicationController');
const { NotificationTypes } = require('@NotificationsModel');
const { getOrgCompanyOrganizer } = require('../organizationProfile/organizationProfileRepository');
const createReviews = async (data) => {
  try {
    const reviews = await Reviews.create(data);
    const organizerId = await getOrgCompanyOrganizer(data.organization);
    await sendUserNotifications({
      recipientIds: [reviews.user.toString()],
      title: "Review Created",
      body: `Your review  has been sent successfully.`,
      data: {
        type: NotificationTypes.EVENT_UPDATE,
        objectType: "group",
        organization_id: reviews.organization.toString(),
      },
      image: "noimage",
      sender: reviews.user,
      objectId: reviews.event,
    });
        await sendUserNotifications({
      recipientIds: [organizerId.toString()],
      title: "Someone Reviewed Your Event",
      body: `A user has submitted a review for your event.`,
      data: {
        type: NotificationTypes.EVENT_UPDATE,
        objectType: "group",
        organization_id: reviews.organization.toString(),
      },
      image: "noimage",
      sender: reviews.user,
      objectId: reviews.event,
    });

    return reviews;

  } catch (err) {
    throw err;
  }
};




const getReviews = async ({ organizationId, timezone, page, limit, keyword, status, userId, date, range, today, skip }) => {
  const pipeline = [
    // Step 1: Match by organizationId and status
    {
      $match: {
        ...(organizationId && { organization: organizationId }),  // Match organization if organizationId is provided
        status: status || { $ne: "deleted" }, // Default to excluding "deleted" status
        ...(date && {
          createdAt: {
            $gte: new Date(date),
            $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)), // Filter by the given date
          },
        }),
      },
    },

    // Step 2: Apply keyword search (if any)
    ...(keyword ? [{
      $match: {
        $or: [
          { "comment": { $regex: keyword, $options: "i" } },
          { "rating": { $regex: keyword, $options: "i" } },
          { "event.basicInfo.title": { $regex: keyword, $options: "i" } },
          { "user.firstName": { $regex: keyword, $options: "i" } },
          { "user.lastName": { $regex: keyword, $options: "i" } },
        ],
      },
    }] : []),

    // Step 3: Lookup user details from Users collection
    {
      $lookup: {
        from: "users",  // Collection name for Users
        localField: "user",  // field in Reviews
        foreignField: "_id",  // field in Users collection
        as: "userDetails",  // Alias for the joined data
      },
    },
    {
      $unwind: { path: "$userDetails", preserveNullAndEmptyArrays: true },  // Flatten the userDetails array
    },

    // Step 4: Project required fields (including user details)
    {
      $project: {
        rating: 1,
        comment: 1,
        organization: 1,
        event: 1,
        createdAt: 1,
        user: {
          firstName: "$userDetails.firstName",
          lastName: "$userDetails.lastName",
          location: "$userDetails.location",
          profileIcon: "$userDetails.profileIcon",
        }
      },
    },

    // Step 5: Sort by createdAt (descending)
    { $sort: { createdAt: -1 } },

    // Step 6: Apply pagination
    {
      $facet: {
        data: [
          { $skip: skip },  // Pagination skip
          ...(limit === 0 ? [] : [{ $limit: limit }])  // Apply limit if provided
        ],
        totalFiltered: [{ $count: "count" }],  // Total count of filtered results
      },
    },
  ];

  // Execute the aggregation pipeline
  const result = await Reviews.aggregate(pipeline);

  // Step 7: Handle the aggregation results
  if (!result || !result[0] || !result[0].data) {
    return { reviews: [], meta: { totalFiltered: 0, averageRating: 0, ratingCounts: {} } };
  }

  let reviews = result[0].data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Step 8: Format image URLs for each review
  reviews = reviews.map(review => formatLoyaltyListing(review));  // Format images using the existing utility

  // Step 9: Calculate average rating and rating counts
  const ratings = reviews.map(review => review.rating);
  const averageRating = ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : 0;
  const ratingCounts = {
    1: ratings.filter(rating => rating === 1).length,
    2: ratings.filter(rating => rating === 2).length,
    3: ratings.filter(rating => rating === 3).length,
    4: ratings.filter(rating => rating === 4).length,
    5: ratings.filter(rating => rating === 5).length,
  };

  // Step 10: Generate meta information for pagination
  const meta = {
    page,
    limit,
    totalFiltered,
    totalPages: Math.ceil(totalFiltered / limit),
    averageRating,
    ratingCounts,
  };

  return { reviews, meta };
};

const getRatingsByEventId = async (eventId, userId) => {
  if (
    !mongoose.Types.ObjectId.isValid(eventId) ||
    !mongoose.Types.ObjectId.isValid(userId)
  ) {
    return null;
  }

  return await Reviews.findOne({
    event: eventId,
    user: userId,
  }).lean();
};
module.exports = {
  createReviews,
  getReviews,
  getRatingsByEventId
};
