// repositories/ReservationRepository.js
const GlobalReferral = require("@GlobalReferralModel");
const UserReservations = require("@UserReservationsModel");
const { User } = require("../../../models/UserModel");
const Event = require("@EventsModel");
const {ReferredRecord} = require("@ReferredRecordModel");
const mongoose = require("mongoose");
// const { reservationsFormatter, reservationsFormatterAdjustDates } = require("../../app/reservations/formaters/reservationFormetter");
const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  getStartAndEndOfMonth,
  getStartAndEndOfWeek,
} = require("../../../helperUtils/responseUtil");
const createGlobalReferral = async (data) => {
  try {
    const { type, status } = data;
    if (type === "global" && status === "active") {
      const existing = await GlobalReferral.findOne({
        type: "global",
        status: "active",
      });

      if (existing) {
        const err = new Error("ACTIVE_GLOBAL_REFERRAL_EXISTS");
        err.statusCode = 400;
        throw err;
      }
    }

    // Create and save
    const globalReferral = await GlobalReferral.create(data);
    return globalReferral;

  } catch (err) {
    throw err; 
  }
};


const getGlobalReferrals = async ({ timezone,page, limit, keyword, status, userId, date, range,today,skip, type }) => {
  const pipeline = [
  {
$match: {
  ...(userId && { creator: new mongoose.Types.ObjectId(userId) }), // Match by userId if provided
  ...(type && { type: type }), // Match by type if provided (e.g., "global", "company", etc.)
}
  }
];
if (range == "monthly") {
  const { start, end } = getStartAndEndOfMonth(today, timezone);

  pipeline.push({
    $match: {
      createdAt: { $gte: start, $lt: end }
    }
  });
}
if (range == "weekly") {
  const { start, end } = getStartAndEndOfWeek(today, timezone);

  pipeline.push({
    $match: {
      createdAt: { $gte: start, $lt: end }
    }
  });
}
if (range == "today") {
    const start = new Date(today);
    const end = new Date(new Date(today).setDate(start.getDate() + 1));

  pipeline.push({
    $match: {
      createdAt: { $gte: start, $lt: end }
    }
  });
}
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
      { schema: GlobalReferral.schema }
    ],
    keyword
  );

  if (Object.keys(keywordMatch).length) {
    pipeline.push({ $match: keywordMatch });
  }
}

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

  const result = await GlobalReferral.aggregate(pipeline);


  let globalReferral = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;


  // Additional counts for meta (active/inactive/total by userId as creator)
  const [total, active, inactive] = await Promise.all([
    GlobalReferral.countDocuments({ ...(userId && { userId: userId }), status: { $ne: "deleted" } }),
    GlobalReferral.countDocuments({ status: "active", ...(userId && { userId: userId }) }),
    GlobalReferral.countDocuments({ status: "inactive", ...(userId && { userId: userId }) })
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.globalReferralCount = { total, active, inactive };


  return {globalReferral , meta}
}



const findByIdAndUpdate = async (id, data) => {
  return GlobalReferral.findByIdAndUpdate(id, data, { new: true });
};

const findGlobalReferralsById = async (id) => {
  return GlobalReferral.findById(id);
};





function getUserImage(userId) {
  return User.findById(userId).lean().then(user => {
    return user?.profileIcon || "noimage.png";
  });
}




const getUserGlobalReferrals = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  userId,
  date,
  range,
  today,
  skip,
  type
}) => {
  const pipeline = [
    {
      $match: {
        ...(type && { type: type }), // Match by type if provided (e.g., "global", "company", etc.)
        ...(userId && { userId: { $ne: null } }) // Only include records with a valid userId
      }
    }
  ];

  // Handle date filtering
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
      [{ schema: ReferredRecord.schema }],
      keyword
    );

    if (Object.keys(keywordMatch).length) {
      pipeline.push({ $match: keywordMatch });
    }
  }

  // Sorting by createdAt in descending order
  pipeline.push({ $sort: { createdAt: -1 } });

  // Apply pagination and counts using $facet
  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        ...(limit === 0 ? [] : [{ $limit: limit }])
      ],
      totalFiltered: [{ $count: "count" }]
    }
  });


  const result = await ReferredRecord.aggregate(pipeline);

  let globalReferral = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Additional counts for meta (active/inactive/total by userId as creator)
  const [total, active, inactive] = await Promise.all([
    ReferredRecord.countDocuments({ ...(userId && { userId: userId }), status: { $ne: "deleted" } }),
    ReferredRecord.countDocuments({ status: "active", ...(userId && { userId: userId }) }),
    ReferredRecord.countDocuments({ status: "inactive", ...(userId && { userId: userId }) })
  ]);

  // Fetching the user names from the Users table
  const userNames = await User.find({ _id: { $in: globalReferral.map(record => record.userId) } })
    .select("firstName lastName _id");

  // Fetching the referrer user names from the Users table
  const referrerNames = await User.find({ _id: { $in: globalReferral.map(record => record.referrerUserId) } })
    .select("firstName lastName _id");

  // Fetch global referral data for the given userId
  const globalReferrals = await GlobalReferral.find({ creator: userId, type: "global" }).lean();


  // Create a map to count how many times each referrerUserId appears
  const referrerCountMap = globalReferral.reduce((acc, record) => {
    acc[record.referrerUserId] = (acc[record.referrerUserId] || 0) + 1;
    return acc;
  }, {});

globalReferral = await Promise.all(
  globalReferral.map(record => {
    const userName = userNames.find(user => user._id.toString() === record.userId.toString());
    const referrerName = referrerNames.find(user => user._id.toString() === record.referrerUserId.toString());

    const referrerUserName = referrerName
      ? `${referrerName.firstName} ${referrerName.lastName}`
      : "";

    const userFullName = userName
      ? `${userName.firstName} ${userName.lastName}`
      : "";

    const referralLimit = globalReferrals[0].referralLimit;

    const remainingReferrals =
      referralLimit - referrerCountMap[record.referrerUserId];

    return getUserImage(record.userId).then(profileIcon => {
      return {
        ...record,
        firstName: userName?.firstName,
        lastName: userName?.lastName,
        profileIcon,   // ← REAL image
        referrerUserName,
        remainingReferrals,
        referralLimit,
        referrerCount: referrerCountMap[record.referrerUserId],
      };
    });
  })
);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.globalReferralCount = { total, active, inactive };

  return { globalReferral, meta };
};

const findGlobalReferrals = async (filter = {}) => {
  try {
    return await GlobalReferral.find(filter);
  } catch (err) {
    throw err;
  }
};

module.exports = {
  createGlobalReferral,
  findGlobalReferralsById,
  getGlobalReferrals,
  findByIdAndUpdate,
  getUserGlobalReferrals
};