// services/reservationservice.js
const { buildKeywordQueryFromModels } = require("../../../helperUtils/dbUtils/queryUtil");
const { generateMeta, getCurrentDateInTimezone } = require("../../../helperUtils/responseUtil");
const { reservationsFormatter } = require("../../../app/reservations/formaters/reservationFormetter");
const {GlobalReferral} = require("@GlobalReferralModel");
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

  // ----------------------------- 
  // ALLOWED FIELDS
  // -----------------------------
  const allowedFields = [
    "rewardAmount",
    "minimumPurchases",
    "purchaseThresholdAmount",
    "expiryDate",
    "status",
    "referralLimit",
    "referrerPoints",
  ];

  if (data.expiryDate === "Invalid date") {
    delete data.expiryDate; // Remove invalid expiry date
  }

  // ----------------------------- 
  // APPLY UPDATE FIELDS
  // -----------------------------
  const updateData = {};
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }

  // If status is being updated to 'active'
  if (updateData.status === "active") {
    // Check if there is already an active global referral program
    const existingActiveReferral = await GlobalReferral.findOne({
      status: "active",
      type: "global",
    });

    // If an active global referral program exists, prevent the update
    if (existingActiveReferral) {
      return { error: "An active global referral program already exists." };
    }
  }

  // If no fields to update, return the existing global referral data
  if (Object.keys(updateData).length === 0) {
    return globalReferral;
  }

  // Apply the update fields to the existing record
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


  module.exports = {
    createGlobalReferral,
    getGlobalReferrals,
    updateGlobalReferral,
getUserGlobalReferrals,
    deleteGlobalReferral
  };