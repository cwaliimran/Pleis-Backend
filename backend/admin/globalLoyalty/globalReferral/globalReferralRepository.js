// repositories/ReservationRepository.js
const GlobalReferralSettings = require("@GlobalReferralSettingsModel");
const { UserReservations } = require("@UserReservationsModel");
const { User } = require("../../../models/UserModel");
const Event = require("@EventsModel");
const { ReferredRecord } = require("@ReferredRecordModel");
const mongoose = require("mongoose");
const { cache, invalidate } = require("@redisCache");
const ACTIVE_GLOBAL_REFERRAL_CACHE_KEY = "globalReferral:active";
const buildGlobalReferralCacheKey = ({
  scope = "public", // public | admin
  skip = 0,
  limit = 10
}) => {
  return `${ACTIVE_GLOBAL_REFERRAL_CACHE_KEY}:${scope}:skip=${skip}:limit=${limit}`;
};


const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  getStartAndEndOfMonth,
  getStartAndEndOfWeek,
} = require("../../../helperUtils/responseUtil");
const { buildKeywordQueryFromModels } = require("@utils/dbUtils/queryUtil");


const upsertGlobalReferral = async (data) => {
  const allowedFields = [
    "userPoints",
    "minimumPurchases",
    "status",
    "referralLimit",
    "referrerPoints",
  ];

  const updateData = {};
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }

  const globalReferral = await GlobalReferralSettings.findOneAndUpdate(
    {},                     // no filter → singleton
    { $set: updateData },
    {
      new: true,
      upsert: true,         // create if not exists
      setDefaultsOnInsert: true,
    }
  );

  await invalidate(ACTIVE_GLOBAL_REFERRAL_CACHE_KEY);

  return globalReferral;
};

const getGlobalReferral = async () => {
    await invalidate(ACTIVE_GLOBAL_REFERRAL_CACHE_KEY);

  return cache({
    namespace: ACTIVE_GLOBAL_REFERRAL_CACHE_KEY,
    ttl: 86400,

    fetchFn: async () => {
      const doc = await GlobalReferralSettings
        .findOne({})
        .lean();

      return doc || null;
    },
  });
};

const getGlobalReferralSettings = async () => {
  return cache({
    namespace: ACTIVE_GLOBAL_REFERRAL_CACHE_KEY,
    ttl: 86400,

    fetchFn: async () => {
      return await GlobalReferralSettings
        .findOne({})
        .select("userPoints referrerPoints minimumPurchases referralLimit")
        .lean();
    },
  });
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
  const cacheKey = buildGlobalReferralCacheKey({
    scope: "public",
    skip,
    limit,
  });

  return cache({
    namespace: cacheKey,
    ttl: 86400,

    fetchFn: async () => {
      const pipeline = [
        {
          $match: {
            ...(type && { type }),
            ...(userId && { userId: { $ne: null } })
          }
        }
      ];

      if (date) {
        const start = new Date(date);
        const end = new Date(new Date(date).setDate(start.getDate() + 1));

        pipeline.push({
          $match: { createdAt: { $gte: start, $lt: end } }
        });
      }

      pipeline.push({ $sort: { createdAt: -1 } });

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

      // =========================
      // 🔥 COUNTS
      // =========================
      const [total, active, inactive] = await Promise.all([
        ReferredRecord.countDocuments({ ...(userId && { userId }), status: { $ne: "deleted" } }),
        ReferredRecord.countDocuments({ status: "active", ...(userId && { userId }) }),
        ReferredRecord.countDocuments({ status: "inactive", ...(userId && { userId }) })
      ]);

      // =========================
      // 🔥 USERS
      // =========================
      const userIds = globalReferral
        .map(r => r.userId)
        .filter(Boolean)
        .map(id => id.toString());

      const referrerIds = globalReferral
        .map(r => r.referrerUserId)
        .filter(Boolean)
        .map(id => id.toString());

      const userNames = await User.find({
        _id: { $in: [...new Set(userIds)] }
      }).select("firstName lastName _id");

      const referrerNames = await User.find({
        _id: { $in: [...new Set(referrerIds)] }
      }).select("firstName lastName _id remainingReferrals");

      const globalReferrals = await GlobalReferralSettings.find({
        creator: userId,
        type: "global"
      }).lean();

      const referrerCountMap = globalReferral.reduce((acc, record) => {
        if (!record.referrerUserId) return acc;
        const key = record.referrerUserId.toString();
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});

      // =========================
      // 🔥 MAIN MAPPING
      // =========================
      globalReferral = await Promise.all(
        globalReferral.map(record => {
          const userName = userNames.find(
            user => user._id.toString() === record.userId?.toString()
          );

          const referrerUser = referrerNames.find(
            user => user._id.toString() === record.referrerUserId?.toString()
          );

          const referrerUserName = referrerUser
            ? `${referrerUser.firstName} ${referrerUser.lastName}`
            : "";

          const referralLimit = globalReferrals?.[0]?.referralLimit ?? 0;
          const remainingReferrals = referrerUser?.remainingReferrals ?? 0;

          // 🔥 NEW STATUS LOGIC
          const computedStatus =
            record.userId && record.referrerUserId ? "joined" : "pending";

          return getUserImage(record.userId).then(profileIcon => ({
            ...record,
            firstName: userName?.firstName,
            lastName: userName?.lastName,
            profileIcon,
            referrerUserName,
            remainingReferrals,
            referralLimit,
            referrerCount:
              record.referrerUserId
                ? referrerCountMap[record.referrerUserId.toString()] || 0
                : 0,

            status: computedStatus // 🔥 override status
          }));
        })
      );

      // =========================
      // 🔥 KEYWORD FILTER
      // =========================
      if (keyword) {
        const regex = new RegExp(keyword, "i");

        globalReferral = globalReferral.filter(item =>
          regex.test(item.firstName || "") ||
          regex.test(item.lastName || "") ||
          regex.test(item.referrerUserName || "")
        );
      }

      // =========================
      // 🔥 FALLBACK (NO DATA)
      // =========================
      if (!globalReferral.length) {
        globalReferral = Array.from({ length: 2 }).map(() => ({
          userId: null,
          referrerUserId: null,
          firstName: "N/A",
          lastName: "N/A",
          profileIcon: "",
          referrerUserName: "N/A",
          remainingReferrals: 0,
          referralLimit: 0,
          referrerCount: 0,
          status: "pending",
          createdAt: null,
        }));
      }

      const meta = generateMeta(page, limit, totalFiltered);
      meta.globalReferralCount = { total, active, inactive };

      return { globalReferral, meta };
    },
  });
};

const findGlobalReferrals = async (filter = {}) => {
  try {
    return await GlobalReferralSettings.find(filter);
  } catch (err) {
    throw err;
  }
};
const resetUserReferralLimits = async (limit) => {
  try {
    await invalidate(ACTIVE_GLOBAL_REFERRAL_CACHE_KEY);
    // Force numeric conversion
    limit = Number(limit);

    if (!Number.isInteger(limit) || limit < 0) {
      const err = new Error("INVALID_REFERRAL_LIMIT");
      err.statusCode = 400;
      throw err;
    }

    await User.updateMany(
      {},
      {
        $set: {
          referralsCount: limit
        }
      }
    );

    return {
      success: true,
      message: `All users referral limits reset to ${limit}`
    };

  } catch (err) {

    throw err;
  }
};


module.exports = {
  upsertGlobalReferral,
  getGlobalReferral,
  findGlobalReferrals,
  getUserGlobalReferrals,
  resetUserReferralLimits,
  getGlobalReferralSettingsRepository: getGlobalReferralSettings,
};