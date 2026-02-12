// repositories/ReservationRepository.js
const GlobalReferral = require("@GlobalReferralModel");
const { ReferredRecord } = require("@ReferredRecordModel");
const mongoose = require("mongoose");
const { User } = require("../../models/UserModel");
const {
  generateMeta,
  getStartAndEndOfMonth,
  getStartAndEndOfWeek,
} = require("../../helperUtils/responseUtil");
const { buildKeywordQueryFromModels } = require("@utils/dbUtils/queryUtil");
const { formatCategories } = require("./formatters/categoryFormatter");
const { NotificationTypes } = require("@NotificationsModel");
const { sendUserNotifications } = require("../../controllers/communicationController");
const createGlobalReferral = async (data) => {
  try {

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

const getGlobalReferrals = async ({ timezone, page, limit, keyword, status, userId, date, range, today, skip, type }) => {
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



  return { globalReferral, meta }
}

const createUserReferradrecord = async (data) => {
  try {
    const { username, userIp, userId } = data;

    // 1️⃣ Get active referral settings
    const referralSettings = await GlobalReferral.findOne({ status: "active" });
    if (!referralSettings) {
      throw new Error("Referral settings not configured.");
    }

    const { referralLimit } = referralSettings;

    // 2️⃣ Check existing referral record by IP
    const existing = await ReferredRecord.findOne({ userIp });

    // 3️⃣ Find referrer
    const referrer = await User.findOne({ username });
    if (!referrer) throw new Error("User not found.");

    // 4️⃣ Check referral limit
    if (referrer.referralsCount >= referralLimit) {
      throw new Error("Referral limit reached.");
    }

    // 5️⃣ Assign referrer if record exists but user not linked yet
    if (existing) {
      if (existing.userId) {
        throw new Error("You already have a referrer assigned.");
      }

      // Atomically increment referralsCount
      const updatedReferrer = await User.findOneAndUpdate(
        {
          _id: referrer._id,
          referralsCount: { $lt: referralLimit },
        },
        { $inc: { referralsCount: 1 } },
        { new: true }
      );

      if (!updatedReferrer) {
        throw new Error("Referral limit reached.");
      }

      existing.userId = userId;
      existing.referrerUserId = referrer._id;
      existing.referrerUserName = username;
      await existing.save();

      return {
        userId: existing.userId,
        referrerUserName: existing.referrerUserName,
      };
    }

    // 6️⃣ New referral record flow
    const updatedReferrer = await User.findOneAndUpdate(
      {
        _id: referrer._id,
        referralsCount: { $lt: referralLimit },
      },
      { $inc: { referralsCount: 1 } },
      { new: true }
    );

    if (!updatedReferrer) {
      throw new Error("Referral limit reached.");
    }

    // 7️⃣ Create referral record
    const newRecord = await ReferredRecord.create({
      referrerUserName: username,
      userIp,
      referrerUserId: referrer._id,
      userId,
      expiryDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    });
    await sendUserNotifications({
      recipientIds: [userId.toString()],
      title: "Referral Successful",
      body: `You have successfully referred by ${username}.`,
      data: {
        type: NotificationTypes.REFERRAL_UPDATE,
        objectType: "User",
      },
      image: "noimage",
      sender: userId,
      objectId: userId,
    });
    await sendUserNotifications({
      recipientIds: [referrer._id.toString()],
      title: "Some one Joined PLEIS through your Referral",
      body: `Congratulations! someone has joined PLEIS using your referral.`,
      data: {
        type: NotificationTypes.REFERRAL_UPDATE,
        objectType: "User",
      },
      image: "noimage",
      sender: userId,
      objectId: userId,
    });


    return {
      userId: newRecord.userId,
      referrerUserName: newRecord.referrerUserName,
    };

  } catch (err) {
    console.error("Error saving referral data:", err);
    throw err;
  }
};







const getUserReferradrecord = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  userId,
  date,
  skip,
  type
}) => {

  const pipeline = [];

  /* ================= MATCH REFERRER ================= */

  pipeline.push({
    $match: {
      ...(type && { type }),
      ...(userId && { referrerUserId: new mongoose.Types.ObjectId(userId) }),
      userId: { $exists: true, $ne: null }
    }
  });

  /* ================= STATUS ================= */

  if (status) {
    pipeline.push({ $match: { status } });
  } else {
    pipeline.push({ $match: { status: { $ne: "deleted" } } });
  }

  /* ================= DATE ================= */

  if (date) {
    const start = new Date(date);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);

    pipeline.push({
      $match: {
        createdAt: { $gte: start, $lt: end }
      }
    });
  }

  /* ================= USER LOOKUP ================= */

  pipeline.push(
    {
      $addFields: {
        userObjectId: {
          $cond: [
            { $eq: [{ $type: "$userId" }, "objectId"] },
            "$userId",
            { $toObjectId: "$userId" }
          ]
        }
      }
    },
    {
      $lookup: {
        from: "users",
        localField: "userObjectId",
        foreignField: "_id",
        as: "userInfo"
      }
    },
    {
      $unwind: {
        path: "$userInfo",
        preserveNullAndEmptyArrays: false
      }
    }
  );

  /* ================= BUILD USER ================= */

  pipeline.push({
    $addFields: {
      user: {
        _id: "$userInfo._id",
        userName: "$userInfo.username",
        email: "$userInfo.email",
        firstName: "$userInfo.firstName",
        lastName: "$userInfo.lastName",
        profileIcon: "$userInfo.profileIcon"
      }
    }
  });

  /* ================= KEYWORD SEARCH ================= */

  if (keyword) {
    pipeline.push({
      $match: {
        $or: [
          { "user.name": { $regex: keyword, $options: "i" } },
          { "user.email": { $regex: keyword, $options: "i" } }
        ]
      }
    });
  }

  /* ================= CLEANUP ================= */

  pipeline.push({
    $project: {
      _id: "$user._id",
      firstName: "$user.firstName",
      lastName: "$user.lastName",
      userName: "$user.userName",
      email: "$user.email",
      profileIcon: "$user.profileIcon"
    }
  });


  pipeline.push({ $sort: { createdAt: -1 } });

  /* ================= PAGINATION ================= */

  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        ...(limit === 0 ? [] : [{ $limit: limit }])
      ],
      totalFiltered: [{ $count: "count" }]
    }
  });

  /* ================= RUN ================= */

  const result = await ReferredRecord.aggregate(pipeline);

  const globalReferral = result?.[0]?.data || [];
  const totalFiltered = result?.[0]?.totalFiltered?.[0]?.count || 0;

  /* ================= COUNTS ================= */

  const [total, active, inactive] = await Promise.all([
    ReferredRecord.countDocuments({
      referrerUserId: userId,
      userId: { $exists: true, $ne: null },
      status: { $ne: "deleted" }
    }),
    ReferredRecord.countDocuments({
      referrerUserId: userId,
      userId: { $exists: true, $ne: null },
      status: "active"
    }),
    ReferredRecord.countDocuments({
      referrerUserId: userId,
      userId: { $exists: true, $ne: null },
      status: "inactive"
    })
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.globalReferralCount = { total, active, inactive };
  const formattedGlobalReferral = formatCategories(globalReferral);
  return { globalReferral: formattedGlobalReferral, meta };
};


module.exports = {
  createGlobalReferral,
  getGlobalReferrals,
  saveReferralData,
  saveUserReferralData,
  createUserReferradrecord,
  getUserReferradrecord
};