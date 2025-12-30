
const {getCurrentDateInTimezone } = require("../../../helperUtils/responseUtil");
const LoyaltyReferralRepo = require("./loyaltyReferralRepository");


const createLoyaltyReferral = async (data) => {
  let LoyaltyReferral = await LoyaltyReferralRepo.createLoyaltyReferral(data);
  return LoyaltyReferral;
};

// Populate venue data for reservations (updated for new schema)
const getLoyaltyReferrals = async ({ timezone, page, limit, keyword, status, companyOrganizer, date, range,type }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { LoyaltyReferral, meta } = await LoyaltyReferralRepo.getLoyaltyReferrals({ timezone, page, limit, keyword, status, companyOrganizer, date, range, today, skip,type });
  return {
    LoyaltyReferral,
    meta
  };
};

const updateLoyaltyReferral = async (data) => {
  const LoyaltyReferral = await LoyaltyReferralRepo.findLoyaltyReferralsById(data.id);

  if (!LoyaltyReferral) {
    return { error: "LoyaltyReferral_not_found" };
  }

  // Authorization
  if (String(data.userId) !== String(LoyaltyReferral.creator)) {
    throw new Error("You are not an admin or IDs mismatch");
  }

  // Allowed fields
  const allowedFields = [
    "userPoints",
    "minimumPurchases",
    "purchaseThresholdAmount",
    "expiryDate",
    "referralLimit",
    "referrerPoints",
  ];

  if (data.expiryDate === "Invalid date") {
    delete data.expiryDate;
  }

  // Build update data
  const updateData = {};
  for (const key of allowedFields) {
    if (data[key] !== undefined) updateData[key] = data[key];
  }

  // ----------------------------------------------------
  // STATUS LOGIC
  // ----------------------------------------------------

  // Case 1: Record is ALREADY ACTIVE & user sends ACTIVE again
  // → DO NOT throw error, DO NOT update anything
  if (updateData.status === "active" && LoyaltyReferral.status === "active") {
    delete updateData.status;
  }

  // Case 2: Record is NOT active, but user wants to activate it
  if (updateData.status === "active" && LoyaltyReferral.status !== "active") {
    const existingActiveReferral = await LoyaltyReferral.findOne({
      _id: { $ne: LoyaltyReferral._id }, // exclude current
      status: "active",
      type: "loyalty",
    });

    if (existingActiveReferral) {
      return { error: "Another active Loyalty referral already exists." };
    }
  }

  // If nothing to update
  if (Object.keys(updateData).length === 0) {
    return LoyaltyReferral;
  }

  // Save updates
  Object.assign(LoyaltyReferral, updateData);
  await LoyaltyReferral.save();

  return LoyaltyReferral;
};



  const deleteLoyaltyReferral = async (id) => {
      const updated = await LoyaltyReferralRepo.findByIdAndUpdate(id, {
        status: "deleted",
      });
      if (!updated) return null;
      return true;
    };



const getUserLoyaltyReferrals = async ({ timezone, page, limit, keyword, status, userId, date, range,type }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { LoyaltyReferral, meta } = await LoyaltyReferralRepo.getUserLoyaltyReferrals({ timezone, page, limit, keyword, status, userId, date, range, today, skip,type });
  return {
    LoyaltyReferral,
    meta
  };
};
const       resetUserReferralLimits
 = async (limit) => {
  let LoyaltyReferral = await LoyaltyReferralRepo.resetUserReferralLimits(limit);
  return LoyaltyReferral;
};

  module.exports = {
    createLoyaltyReferral,
    getLoyaltyReferrals,
    updateLoyaltyReferral,
getUserLoyaltyReferrals,
    deleteLoyaltyReferral,
      resetUserReferralLimits
  };