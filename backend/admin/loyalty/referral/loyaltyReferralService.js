
const { getCurrentDateInTimezone } = require("../../../helperUtils/responseUtil");
const LoyaltyReferralRepo = require("./loyaltyReferralRepository");


/* =========================================================
   SETTINGS (Singleton Per companyOrganizer)
========================================================= */

/**
 * Create OR Update (Upsert)
 */
const createLoyaltyReferral = async (data) => {
  return await LoyaltyReferralRepo.createLoyaltyReferral(data);
};


/**
 * Get Settings (Single Object, No Meta, No Pagination)
 */
const getLoyaltyReferrals = async ({ companyOrganizer }) => {
  return await LoyaltyReferralRepo.getLoyaltyReferrals({ companyOrganizer });
};


/**
 * Update Settings (Scoped Per Company)
 */
const updateLoyaltyReferral = async (data) => {

  const existing = await LoyaltyReferralRepo.findLoyaltyReferralsById(data.id);

  if (!existing) {
    return { error: "LoyaltyReferral_not_found" };
  }

  const allowedFields = [
    "userPoints",
    "minimumPurchases",
    "referralLimit",
    "referrerPoints",
    "status",
  ];

  const updateData = {};
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return existing;
  }

  return await LoyaltyReferralRepo.findByIdAndUpdate(data.id, updateData);
};


/**
 * Soft Delete (Just mark deleted)
 */
const deleteLoyaltyReferral = async (id) => {

  const updated = await LoyaltyReferralRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });

  if (!updated) return null;

  return true;
};





/* =========================================================
   USER REFERRAL RECORDS (Pagination Preserved)
========================================================= */

const getUserLoyaltyReferrals = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  userId,
  date,
  companyOrganizer,
  type,
}) => {

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const today = getCurrentDateInTimezone({
    timezone,
    isDateOnly: true,
  });

  const { LoyaltyReferral, meta } =
    await LoyaltyReferralRepo.getUserLoyaltyReferrals({
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
    });
    console.log(" LoyaltyReferral", LoyaltyReferral);

  return {
    LoyaltyReferral,
    meta,
  };
};


/**
 * Reset referral limits for all users
 */
const resetUserReferralLimits = async (limit) => {
  return await LoyaltyReferralRepo.resetUserReferralLimits(limit);
};



module.exports = {
  createLoyaltyReferral,
  getLoyaltyReferrals,
  updateLoyaltyReferral,
  getUserLoyaltyReferrals,
  deleteLoyaltyReferral,
  resetUserReferralLimits
};