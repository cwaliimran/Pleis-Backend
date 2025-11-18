const { User } = require("../../../models/UserModel");

/**
 * Get organizer users with filters and pagination
 */
const getOrganizerUsersWithFilters = async ({ skip = 0, limit = 10, keyword }) => {
  const pipeline = [
    {
      $match: {
        "accountState.userType": "organizer",
        "verificationStatus.email": "verified",
        "accountState.status": "active",
      },
    },
  ];

  // Keyword search on profile.name, email, or username
  if (keyword) {
    const regex = new RegExp(keyword, "i");
    pipeline.push({
      $match: {
        $or: [
          { "profile.name": regex },
          { "companyDetails.name": regex },
          { "companyDetails.loyaltySettings.title": regex },
          { email: regex },
          { username: regex },
        ],
      },
    });
  }

  // TODO check that user should not be member
  // Only select name and email
  pipeline.push({
    $project: {
      "firstName": 1,
      "lastName": 1,
      "profileIcon": 1,
      "companyDetails.name": 1,
      "companyDetails.loyaltySettings.title": 1,
      "companyDetails.loyaltySettings.model": 1,
      "companyDetails.loyaltySettings.pointValuePercentage": 1,
    },
  });

  // Sort newest first
  pipeline.push({ $sort: { createdAt: -1 } });

  // Paginate and count
  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        ...(limit === 0 ? [] : [{ $limit: limit }]),
      ],
      totalFiltered: [{ $count: "count" }],
    },
  });

  const result = await User.aggregate(pipeline);
  const listings = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  return { listings, totalFiltered };
};

module.exports = {
  getOrganizerUsersWithFilters,
};
