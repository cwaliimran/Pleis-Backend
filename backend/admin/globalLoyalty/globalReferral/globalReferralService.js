// services/reservationservice.js
const { buildKeywordQueryFromModels } = require("../../../helperUtils/dbUtils/queryUtil");
const { generateMeta, getCurrentDateInTimezone } = require("../../../helperUtils/responseUtil");
const { reservationsFormatter } = require("../../../app/reservations/formaters/reservationFormetter");
const GlobalReferralSettings = require("@GlobalReferralSettingsModel");
const Reservations = require("@ReservationsModel");
const UserReservations = require("@UserReservationsModel");
const GlobalReferralRepo = require("./globalReferralRepository");
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

const saveGlobalReferral = async (data) => {
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

  if (Object.keys(updateData).length === 0) {
    return { error: "No valid fields provided for update" };
  }

  const globalReferral =
    await GlobalReferralRepo.upsertGlobalReferral(updateData);

  return globalReferral;
};


const getGlobalReferrals = async () => {
  const  globalReferral =
    await GlobalReferralRepo.getGlobalReferral();
  return globalReferral;
};




const getUserGlobalReferrals = async ({ timezone, page, limit, keyword, status, userId, date, range, type }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { globalReferral, meta } = await GlobalReferralRepo.getUserGlobalReferrals({ timezone, page, limit, keyword, status, userId, date, range, today, skip, type });
  return {
    globalReferral,
    meta
  };
};
const resetUserReferralLimits
  = async (limit) => {
    let settings = await GlobalReferralRepo.resetUserReferralLimits(limit);
    return settings;
  };

module.exports = {
  saveGlobalReferral,
  getGlobalReferrals,
  getUserGlobalReferrals,
  resetUserReferralLimits
};