// services/reservationservice.js
const { buildKeywordQueryFromModels } = require("../../../helperUtils/dbUtils/queryUtil");
const { generateMeta, getCurrentDateInTimezone } = require("../../../helperUtils/responseUtil");
const { reservationsFormatter } = require("../../../app/reservations/formaters/reservationFormetter");
const GlobalReferral = require("@GlobalReferralModel");
const Reservations = require("@ReservationsModel");
const UserReservations = require("@UserReservationsModel");
const GlobalReferralRepo = require("./globalReferralRepository");
const mongoose = require("mongoose");
const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
  convertTimezoneToUtc,
  getStartAndEndOfMonth,
  getStartAndEndOfWeek,
} = require("@utils/responseUtil");

const createGlobalReferral = async (data) => {
  let GlobalReferral = await GlobalReferralRepo.createGlobalReferral(data);
  return GlobalReferral;
};

// Populate venue data for reservations (updated for new schema)
const getGlobalReferrals = async ({ timezone, page, limit, keyword, status, userId, date, range,type }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { globalReferral, meta } = await GlobalReferralRepo.getGlobalReferrals({ timezone, page, limit, keyword, status, userId, date, range, today, skip,type });
  return {
    globalReferral,
    meta
  };
};

const updateGlobalReferral = async (data) => {
  const globalReferral = await GlobalReferralRepo.findGlobalReferralsById(data.id);

  if (!globalReferral) {
    return { error: "GlobalReferral_not_found" };
  }

  // Authorization
  if (String(data.userId) !== String(globalReferral.creator)) {
    throw new Error("You are not an admin or IDs mismatch");
  }

  // Allowed fields
  const allowedFields = [
    "userPoints",
    "minimumPurchases",
    "status",
    "referralLimit",
    "referrerPoints",
  ];


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
  if (updateData.status === "active" && globalReferral.status === "active") {
    delete updateData.status;
  }

  // Case 2: Record is NOT active, but user wants to activate it
  if (updateData.status === "active" && globalReferral.status !== "active") {
    const existingActiveReferral = await GlobalReferral.findOne({
      _id: { $ne: globalReferral._id }, // exclude current
      status: "active",
      type: "global",
    });

    if (existingActiveReferral) {
      return { error: "Another active global referral already exists." };
    }
  }

  // If nothing to update
  if (Object.keys(updateData).length === 0) {
    return globalReferral;
  }

  // Save updates
  Object.assign(globalReferral, updateData);
  await globalReferral.save();

  return globalReferral;
};



  const deleteGlobalReferral = async (id) => {
      const updated = await GlobalReferralRepo.findByIdAndUpdate(id, {
        status: "deleted",
      });
      if (!updated) return null;
      return true;
    };



const getUserGlobalReferrals = async ({ timezone, page, limit, keyword, status, userId, date, range,type }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { globalReferral, meta } = await GlobalReferralRepo.getUserGlobalReferrals({ timezone, page, limit, keyword, status, userId, date, range, today, skip,type });
  return {
    globalReferral,
    meta
  };
};
const       resetUserReferralLimits
 = async (limit) => {
  let GlobalReferral = await GlobalReferralRepo.resetUserReferralLimits(limit);
  return GlobalReferral;
};

  module.exports = {
    createGlobalReferral,
    getGlobalReferrals,
    updateGlobalReferral,
getUserGlobalReferrals,
    deleteGlobalReferral,
      resetUserReferralLimits
  };