// repositories/ReservationRepository.js
const GlobalReferral = require("@GlobalReferralModel");
const {ReferredRecord} = require("@ReferredRecordModel");
const UserReservations = require("@UserReservationsModel");
const { User } = require("../../models/UserModel");
const mongoose = require("mongoose");
const { reservationsFormatter, reservationsFormatterAdjustDates } = require("../../app/reservations/formaters/reservationFormetter");
const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  getStartAndEndOfMonth,
  getStartAndEndOfWeek,
} = require("../../helperUtils/responseUtil");
const createGlobalReferral = async (data) => {
  try {
    console.log("Creating global referral with data:", data);
    const globalReferral = new GlobalReferral(data);
    await globalReferral.save();
    return globalReferral;
  } catch (err) {
    throw err;
  }
};
const saveReferralData = async (referralId, type) => {
  try {
    const user = await User.findById(referralId).lean();
    console.log("user", user);

    if (!user) {
      throw new Error("User not found for referralId");
    }
    if (!user.username) {
      throw new Error("Please create a username first before sharing.");
    }

    return user.username;

  } catch (err) {
    throw err; 
  }
};


const saveUserReferralData = async (username, ip) => {
  try {
    const existing = await ReferredRecord.findOne({ userIp: ip });

    if (existing) {
      if (existing.userId) {
        return { userId: existing.userId, referrerUserName: existing.referrerUserName };
      }

      if (existing.referrerUserName !== username) {
        existing.referrerUserName = username;

        // Step 1: Find the referrer by username to get the referrer userId
        const referrer = await User.findOne({ username }).lean();  // Fetch user by username

        if (!referrer) {
          throw new Error("Referrer not found.");
        }

        // Step 2: Set referrerUserId with the referrer ObjectId
        existing.referrerUserId = referrer._id;  // Set referrer userId (ObjectId)
        
        await existing.save();
        return { userId: existing.userId, referrerUserName: existing.referrerUserName };
      }

      return { userId: existing.userId, referrerUserName: existing.referrerUserName };
    }

    // If no referral record exists for this IP, create a new one
    const referrer = await User.findOne({ username }).lean();  // Fetch user by username

    if (!referrer) {
      throw new Error("Referrer not found.");
    }

    const newRecord = await ReferredRecord.create({
      referrerUserName: username,
      userIp: ip,
      referrerUserId: referrer._id,  // Set the referrer ObjectId
      status: false,  // Default status is false
    });

    return { userId: newRecord.userId, referrerUserName: newRecord.referrerUserName };
  } catch (err) {
    console.error("Error saving referral data:", err);
    throw err;  // Rethrow the error for handling in the calling function
  }
};

const getGlobalReferrals = async ({ timezone,page, limit, keyword, status, userId, date, range,today,skip, type }) => {
  const pipeline = [
  {
$match: {
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


  console.log("globalReferral repository ",globalReferral );
  return {globalReferral , meta}
}

const createUserReferradrecord = async (data) => {
  try {
    const { username, userIp, userId } = data;  
    const existing = await ReferredRecord.findOne({ userIp: userIp });

    if (existing) {
      if (!existing.userId) {
        const user = await User.findOne({ username }).lean();
        if (!user) {
          throw new Error("User not found.");
        }
        existing.userId = userId;  // Set the userId
        existing.referrerUserName = username;  // Update the referrerUserName
        existing.referrerUserId = user._id;  // Set the referrer userId

        // Save the updated referral record
        await existing.save();

        return { userId: existing.userId, referrerUserName: existing.referrerUserName };
      }

      throw new Error("You already have a referrer assigned.");
    }


    const referrer = await User.findOne({ username }).lean();  

    if (!referrer) {
      throw new Error("User not found.");
    }


    const newRecord = await ReferredRecord.create({
      referrerUserName: username,
      userIp: userIp,
      referrerUserId: referrer._id,  // Set the referrer userId
      userId: userId,  // Set the userId when the user is signing up
      status: false,  // Default status is false
    });

    return { userId: newRecord.userId, referrerUserName: newRecord.referrerUserName };
  } catch (err) {
    console.error("Error saving referral data:", err);
    throw err;  // Rethrow the error for handling in the calling function
  }
};









module.exports = {
  createGlobalReferral,
  getGlobalReferrals,
  saveReferralData,
  saveUserReferralData,
  createUserReferradrecord,
};