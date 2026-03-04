// repositories/ReservationRepository.js

const LoyaltyReferralSettings = require("@LoyaltyReferralSettingsModel");
const { User } = require("../../../models/UserModel");
const mongoose = require("mongoose");

const {
  generateMeta,
} = require("../../../helperUtils/responseUtil");

const { LoyaltyReferredRecords } = require("@LoyaltyReferredRecordModel");



/* =========================================================
   SETTINGS (SINGLETON PER companyOrganizer)
========================================================= */

/**
 * Create OR Update Loyalty Referral Settings
 * Always 1 record per companyOrganizer
 */
const createLoyaltyReferral = async (data) => {
  const { companyOrganizer } = data;

  if (!companyOrganizer) {
    const err = new Error("COMPANY_ORGANIZER_REQUIRED");
    err.statusCode = 400;
    throw err;
  }

  return await LoyaltyReferralSettings.findOneAndUpdate(
    { companyOrganizer },
    { $set: data },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );
};


/**
 * Get settings (single object, no pagination, no meta)
 */
const getLoyaltyReferrals = async ({ companyOrganizer }) => {
  if (!companyOrganizer) return null;

  return await LoyaltyReferralSettings
    .findOne({ companyOrganizer })
    .lean();
};


/**
 * Safe update (scoped per company)
 */
const findByIdAndUpdate = async (id, data) => {
  const existing = await LoyaltyReferralSettings.findById(id);
  if (!existing) return null;

  return LoyaltyReferralSettings.findOneAndUpdate(
    { companyOrganizer: existing.companyOrganizer },
    { $set: data },
    { new: true }
  );
};


const findLoyaltyReferralsById = async (id) => {
  return LoyaltyReferralSettings.findById(id).lean();
};


const findLoyaltyReferralSettingsByCompanyOrganizer = async (companyOrganizer) => {
  return await LoyaltyReferralSettings
    .findOne({ companyOrganizer })
    .lean();
};



/* =========================================================
   USER REFERRAL RECORDS (PAGINATION + META PRESERVED)
   ⚠ DO NOT MODIFY (As Requested)
========================================================= */

const getUserImage = async (userId) => {
  const user = await User.findById(userId).lean();
  return user?.profileIcon || "noimage.png";
};


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

  const pipeline = [
    {
      $match: {
        ...(type && { type }),
        ...(status && { status }),
      },
    },
  ];

  // Date filtering
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

  // Get singleton settings
  const referralSettings = await LoyaltyReferralSettings.findOne({
    companyOrganizer: companyOrganizerId,
  });

  if (!referralSettings) {
    return { LoyaltyReferral: [], meta: generateMeta(page, limit, 0) };
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
    LoyaltyReferral.map(async (record) => {
      const userName = userNames.find(
        (user) => user._id.toString() === record.user.toString()
      );

      const referrerUser = referrerNames.find(
        (user) => user._id.toString() === record.referrer.toString()
      );

      const remainingReferrals = referrerUser?.remainingReferrals ?? 0;

      const profileIcon = await getUserImage(record.user);

      return {
        ...record,
        firstName: userName?.firstName,
        lastName: userName?.lastName,
        profileIcon,
        referrerUserName:
          referrerUser?.firstName + " " + referrerUser?.lastName,
        remainingReferrals,
        loyaltyReferralsCount: referrerUser?.loyaltyReferralsCount,
        referralLimit,
      };
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
};



const resetUserReferralLimits = async (limit) => {
  limit = Number(limit);

  if (!Number.isInteger(limit) || limit < 0) {
    const err = new Error("INVALID_REFERRAL_LIMIT");
    err.statusCode = 400;
    throw err;
  }

  await User.updateMany(
    {},
    { $set: { loyaltyReferralsCount: limit } }
  );

  return {
    success: true,
    message: `All users referral limits reset to ${limit}`,
  };
};



module.exports = {
  createLoyaltyReferral,
  findLoyaltyReferralsById,
  getLoyaltyReferrals,
  findByIdAndUpdate,
  getUserLoyaltyReferrals, // untouched (pagination preserved)
  resetUserReferralLimits,
  findLoyaltyReferralSettingsByCompanyOrganizer,
};