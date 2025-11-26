const { User } = require("../../../models/UserModel");
const mongoose = require("mongoose");




const getOrganizerUsersWithFilters = async ({ skip = 0, limit = 10, keyword, userId }) => {
  const me = new mongoose.Types.ObjectId(userId);

  const pipeline = [
    {
      $match: {
        "accountState.userType": "organizer",
        "verificationStatus.email": "verified",
        "accountState.status": "active",
      },
    },
  ];

  // --------------------------- KEYWORD SEARCH ---------------------------
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

  // -------------------- LOOKUP COLLABORATION STATUS --------------------
pipeline.push({
  $lookup: {
    from: "clubcollaborations",
    let: { organizerId: "$_id", me: me },
    pipeline: [
      {
        $match: {
          $expr: {
            $and: [
              { $eq: ["$sender.id", "$$me"] }, 
              { $eq: ["$receiver.id", "$$organizerId"] }
            ]
          }
        }
      },
      {
        $project: {
          senderStatus: "$sender.status",
          _id: 0
        }
      }
    ],
    as: "collab"
  }
});



  // -------------------- ADD collaborationStatus FIELD --------------------
pipeline.push({
  $addFields: {
    collaborationStatus: {
      $cond: {
        if: { $gt: [{ $size: "$collab" }, 0] },
        then: { $first: "$collab.senderStatus" }, 
        else: "send request"
      }
    }
  }
});


  // --------------------------- PROJECT FIELDS ---------------------------
pipeline.push({
  $project: {
    _id: 1, // REQUIRED!
    firstName: 1,
    lastName: 1,
    profileIcon: 1,
    "companyDetails.name": 1,
    "companyDetails.loyaltySettings.title": 1,
    "companyDetails.loyaltySettings.model": 1,
    "companyDetails.loyaltySettings.pointValuePercentage": 1,
    collaborationStatus: 1  // <-- REQUIRED
  }
});


  // --------------------------- SORT ---------------------------
  pipeline.push({ $sort: { createdAt: -1 } });

  // ------------------------- PAGINATION -------------------------
  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        ...(limit === 0 ? [] : [{ $limit: limit }]),
      ],
      totalFiltered: [{ $count: "count" }],
    },
  });

  // --------------------------- EXECUTE ---------------------------
  const result = await User.aggregate(pipeline);
  const listings = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  return { listings, totalFiltered };
};

module.exports = {
  getOrganizerUsersWithFilters,
};
