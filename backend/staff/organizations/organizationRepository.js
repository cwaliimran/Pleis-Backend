

const Organizations = require("@OrganizationModel");
const mongoose = require("mongoose");


const getOrganizationsAsStaff = async (userId) => {
  userId = userId?.userId || userId;
  userId = new mongoose.Types.ObjectId(userId);

  const organizations = await Organizations.aggregate([
    {
      $match: {
        $or: [
          { creator: userId },
          { "staff.user": userId },
        ],
      },
    },

    // 🔹 Get current venue (ONLY title + location)
    {
      $lookup: {
        from: "venues",
        let: { orgId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$organization", "$$orgId"] },
                  { $eq: ["$status", "active"] },
                  { $eq: ["$isPrimary", true] },
                ],
              },
            },
          },
          { $sort: { isPrimary: -1, createdAt: -1 } },
          { $limit: 1 },

          // ✅ Only select what you need
          {
            $project: {
              _id: 0,          // optional
              title: 1,
              "location.fullAddress": 1,
            },
          },
        ],
        as: "currentVenue",
      },
    },

    // 🔹 Flatten venue array
    {
      $addFields: {
        currentVenue: { $arrayElemAt: ["$currentVenue", 0] },
      },
    },

    // 🔹 Filter staff if user is not creator
    {
      $addFields: {
        staff: {
          $cond: [
            { $eq: ["$creator", userId] },
            "$staff",
            {
              $filter: {
                input: "$staff",
                as: "s",
                cond: { $eq: ["$$s.user", userId] },
              },
            },
          ],
        },
      },
    },

    {
      $project: {
        basicInfo: 1,
        staff: 1,
        creator: 1,
        currentVenue: 1,
      },
    },
  ]);

  return organizations;
};




module.exports = {

  getOrganizationsAsStaff,

};
