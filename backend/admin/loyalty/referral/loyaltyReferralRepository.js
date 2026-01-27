// repositories/ReservationRepository.js
const LoyaltyReferralSettings = require("@LoyaltyReferralSettingsModel");
const { User } = require("../../../models/UserModel");
const Event = require("@EventsModel");
const mongoose = require("mongoose");
const { cache, invalidate } = require("@redisCache");
const ACTIVE_LOYALTY_REFERRAL_CACHE_KEY = "loyaltyReferral:active";
const buildLoyaltyReferralCacheKey = ({
  scope = "admin", // public | admin
  skip = 0,
  limit = 10
}) => {
  return `${ACTIVE_LOYALTY_REFERRAL_CACHE_KEY}:${scope}:skip=${skip}:limit=${limit}`;
};
const {
  generateMeta,
  getStartAndEndOfMonth,
  getStartAndEndOfWeek,
} = require("../../../helperUtils/responseUtil");
const { buildKeywordQueryFromModels } = require("@utils/dbUtils/queryUtil");
const { LoyaltyReferredRecords } = require("@LoyaltyReferredRecordModel");
const createLoyaltyReferral = async (data) => {
  try {
    const { type, status, companyOrganizer } = data; // creator represents companyOrganizer

    // Check if a "Loyalty" referral is active for the same companyOrganizer (creator)
    if (type === "loyalty" && status === "active") {
      const existing = await LoyaltyReferralSettings.findOne({
        companyOrganizer: companyOrganizer,  // Use creator as companyOrganizer
        status: "active",
      });

      if (existing) {
        const err = new Error(`ACTIVE_LOYALTY_REFERRAL_EXISTS_FOR_COMPANY ${companyOrganizer}`);
        err.statusCode = 400;
        throw err;
      }
    }

    // Create and save the new Loyalty Referral
    const loyaltyReferral = await LoyaltyReferralSettings.create(data);
    await invalidate(ACTIVE_LOYALTY_REFERRAL_CACHE_KEY); // Invalidate cache
    return loyaltyReferral;

  } catch (err) {
    throw err;
  }
};


const getLoyaltyReferrals = async ({ timezone,page, limit, keyword, status, companyOrganizer, date, range,today,skip, type }) => {
    const cacheKey = buildLoyaltyReferralCacheKey({
    scope: "admin",
    skip,
    limit,
  });
  return cache({
    namespace: cacheKey,
    ttl: 86400, // 1 day
 
    fetchFn: async () => {
  const pipeline = [
  {
$match: {
  ...(companyOrganizer && { companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer) }), // Match by companyOrganizer if provided
  ...(type && { type: type }), // Match by type if provided (e.g., "Loyalty", "company", etc.)
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
      { schema: LoyaltyReferral.schema }
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

  const result = await LoyaltyReferralSettings.aggregate(pipeline);


  let LoyaltyReferral = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;


  // Additional counts for meta (active/inactive/total by userId as creator)
  const [total, active, inactive] = await Promise.all([
    LoyaltyReferralSettings.countDocuments({ ...(companyOrganizer && { companyOrganizer: companyOrganizer }), status: { $ne: "deleted" } }),
    LoyaltyReferralSettings.countDocuments({ status: "active", ...(companyOrganizer && { companyOrganizer: companyOrganizer }) }),
    LoyaltyReferralSettings.countDocuments({ status: "inactive", ...(companyOrganizer && { companyOrganizer: companyOrganizer }) })
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.LoyaltyReferralCount = { total, active, inactive };


  return {LoyaltyReferral , meta}
    },
  });
};




const findByIdAndUpdate = async (id, data) => {
  await invalidate(ACTIVE_LOYALTY_REFERRAL_CACHE_KEY); // Invalidate cache
  return LoyaltyReferralSettings.findByIdAndUpdate(id, data, { new: true });
};

const findLoyaltyReferralsById = async (id) => {
  return LoyaltyReferralSettings.findById(id);
};





function getUserImage(userId) {
  return User.findById(userId).lean().then(user => {
    return user?.profileIcon || "noimage.png";
  });
}






const getUserLoyaltyReferrals = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  userId,
  date,
  companyOrganizer,
  today,
  skip,
  type,
}) => {
  const cacheKey = buildLoyaltyReferralCacheKey({
    scope: "public",
    skip,
    limit,
  });

  return cache({
    namespace: cacheKey,
    ttl: 86400, // 1 day

    fetchFn: async () => {
      const pipeline = [
        {
          $match: {
            ...(type && { type }),
            ...(status && { status }),
          },
        },
      ];

      // Handle date filtering
      if (date) {
        const start = new Date(date);
        const end = new Date(new Date(date).setDate(start.getDate() + 1));

        pipeline.push({
          $match: {
            createdAt: { $gte: start, $lt: end },
          },
        });
      }

      const companyOrganizerId = new mongoose.Types.ObjectId(companyOrganizer);

      const referralSettings = await LoyaltyReferralSettings.findOne({
        companyOrganizer: companyOrganizerId,
      });

      if (!referralSettings) {
        throw new Error("Referral settings not found for the given company.");
      }

      const { referralLimit } = referralSettings;

      pipeline.push({
        $match: {
          companyOrganizer: companyOrganizerId,
        },
      });

      pipeline.push({ $sort: { createdAt: -1 } });

      pipeline.push({
        $facet: {
          data: [
            { $skip: skip },
            ...(limit === 0 ? [] : [{ $limit: limit }]),
          ],
          totalFiltered: [{ $count: "count" }],
        },
      });

      const result = await LoyaltyReferredRecords.aggregate(pipeline);

      let LoyaltyReferral = result[0]?.data || [];
      const totalFiltered = result[0]?.totalFiltered?.[0]?.count || 0;

      const [total, active, inactive] = await Promise.all([
        LoyaltyReferredRecords.countDocuments({
          ...(userId && { user: userId }),
          status: { $ne: "deleted" },
        }),
        LoyaltyReferredRecords.countDocuments({
          status: "active",
          ...(userId && { user: userId }),
        }),
        LoyaltyReferredRecords.countDocuments({
          status: "inactive",
          ...(userId && { user: userId }),
        }),
      ]);

      const userNames = await User.find({
        _id: { $in: LoyaltyReferral.map((record) => record.user) },
      }).select("firstName lastName _id");

      const referrerNames = await User.find({
        _id: { $in: LoyaltyReferral.map((record) => record.referrer) },
      }).select("firstName lastName _id loyaltyReferralsCount");

      const referrerCountMap = LoyaltyReferral.reduce((acc, record) => {
        const key = record.referrer.toString();
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});

      LoyaltyReferral = await Promise.all(
        LoyaltyReferral.map((record) => {
          const userName = userNames.find(
            (user) => user._id.toString() === record.user.toString()
          );

          const referrerUser = referrerNames.find(
            (user) => user._id.toString() === record.referrer.toString()
          );

          const remainingReferrals = referrerUser?.remainingReferrals ?? 0;

          return getUserImage(record.user).then((profileIcon) => ({
            ...record,
            firstName: userName?.firstName,
            lastName: userName?.lastName,
            profileIcon,
            referrerUserName:
              referrerUser?.firstName + " " + referrerUser?.lastName,
            remainingReferrals,
            loyaltyReferralsCount: referrerUser?.loyaltyReferralsCount,
            referralLimit,
          }));
        })
      );

      if (keyword) {
        const regex = new RegExp(keyword, "i");

        LoyaltyReferral = LoyaltyReferral.filter(
          (item) =>
            regex.test(item.firstName || "") ||
            regex.test(item.lastName || "") ||
            regex.test(item.referrerUserName || "")
        );
      }

      const meta = generateMeta(page, limit, totalFiltered);
      meta.LoyaltyReferralCount = { total, active, inactive };

      return { LoyaltyReferral, meta };
    },
  });
};



const findLoyaltyReferrals = async (filter = {}) => {
  try {
    return await LoyaltyReferral.find(filter);
  } catch (err) {
    throw err;
  }
};
const resetUserReferralLimits = async (limit) => {
  try {
    await invalidate(ACTIVE_LOYALTY_REFERRAL_CACHE_KEY); // Invalidate cache
   
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
          loyaltyReferralsCount: limit
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
  createLoyaltyReferral,
  findLoyaltyReferralsById,
  getLoyaltyReferrals,
  findByIdAndUpdate,
  getUserLoyaltyReferrals,
  resetUserReferralLimits
};