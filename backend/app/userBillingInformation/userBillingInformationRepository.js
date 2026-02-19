
const { UserBillingInformation } = require("@UserBillingInformationModel");
const { buildKeywordQueryFromModels } = require("@utils/dbUtils/queryUtil");
const { generateMeta } = require("@utils/responseUtil");
const mongoose = require("mongoose");
const { formatbilling } = require("./formatters/formatUserBilling");

const createUserBillingInformation = async (data) => {
  try {
    const userBillingInformation = new UserBillingInformation(data);
    await userBillingInformation.save();
    return userBillingInformation;
  } catch (err) {
    throw err;
  }
};



const getUserBillingInformations = async ({ timezone, page, limit, keyword, status, userId, date, range, today, skip }) => {

  const pipeline = [];
  pipeline.push({
    $match: {
      ...(userId && { user: new mongoose.Types.ObjectId(userId) }),
    }
  });
  // Apply filters
  if (status) {
    pipeline.push({ $match: { status } });
  } else {
    pipeline.push({ $match: { status: { $ne: "deleted" } } });
  }

  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    pipeline.push({
      $match: {
        createdAt: { $gte: start, $lt: end }
      }
    });
  }

  if (keyword) {
    const keywordMatch = buildKeywordQueryFromModels(
      [
        { schema: UserBillingInformation.schema }
      ],
      keyword
    );

    if (Object.keys(keywordMatch).length) {
      pipeline.push({ $match: keywordMatch });
    }
  }
  // pipeline.push({
  //   $lookup: {
  //     from: "users", // The collection you're populating from
  //     localField: "user", // The field in UserBillingInformation that references the User
  //     foreignField: "_id", // The field in the User model
  //     as: "user", // Alias for the populated data
  //     pipeline: [
  //       {
  //         $project: {
  //           _id: 1,
  //           firstName: 1,
  //           lastName: 1,
  //           email: 1,
  //           username: 1,
  //           profileIcon: 1,

  //         }
  //       }
  //     ]
  //   }
  // });
  // // Unwind the userDetails array to flatten the result
  // pipeline.push({
  //   $unwind: {
  //     path: "$user",
  //     preserveNullAndEmptyArrays: true // Ensures documents without userDetails are still included
  //   }
  // });

  pipeline.push({ $sort: { createdAt: -1 } });

  // Apply pagination + counts using $facet
  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        ...(limit === 0 ? [] : [{ $limit: limit }])
      ],
      totalFiltered: [{ $count: "count" }]
    }
  });

  const result = await UserBillingInformation.aggregate(pipeline);

  let UserBillingInformations = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Additional counts for meta (active/inactive/total by userId as creator)
  const [total, active, inactive] = await Promise.all([
    UserBillingInformation.countDocuments({ ...(userId && { user: userId }), status: { $ne: "deleted" } }),
    UserBillingInformation.countDocuments({ status: "active", ...(userId && { user: userId }) }),
    UserBillingInformation.countDocuments({ status: "deleted", ...(userId && { user: userId }) })
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.UserBillingInformationsCount = { total, active, inactive };
  return { UserBillingInformations, meta }
}

const findUserBillingInformationById = async (id) => {
  return UserBillingInformation.findById(id);
};

const findByIdAndUpdate = async (id, data) => {
  return UserBillingInformation.findByIdAndUpdate(id, data, { new: true });
};
const deleteUserBillingInformation = async (id) => {
  return await UserBillingInformation.findByIdAndDelete(id);
};

const updateBadgeStatusById = async (id, status) => {
  return findByIdAndUpdate(id, { status });
};
module.exports = {
  createUserBillingInformation,
  getUserBillingInformations,
  findUserBillingInformationById,
  findByIdAndUpdate,
  deleteUserBillingInformation,
  updateBadgeStatusById

};