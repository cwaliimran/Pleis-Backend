// services/reservationservice.js
const { buildKeywordQueryFromModels } = require("../../helperUtils/dbUtils/queryUtil");
const { generateMeta, getCurrentDateInTimezone } = require("../../helperUtils/responseUtil");
const { reservationsFormatter } = require("../../app/reservations/formaters/reservationFormetter");
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
console.log("GlobalReferrals service ",globalReferral );
  return {
    globalReferral,
    meta
  };
};

const updateGlobalReferral = async (data) => {
  console.log("id is ",data.id );
  const GlobalReferral = await GlobalReferralRepo.findGlobalReferralsById(data.id);
  if (!GlobalReferral) {
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

  ];
if(data.expiryDate=="Invalid date"){
    delete data.expiryDate;
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

  if (Object.keys(updateData).length === 0) {
    return GlobalReferral;
  }

  Object.assign(GlobalReferral, updateData);
  await GlobalReferral.save();

  return GlobalReferral;
};

  const deleteGlobalReferral = async (id) => {
      const updated = await GlobalReferralRepo.findByIdAndUpdate(id, {
        status: "deleted",
      });
      if (!updated) return null;
      return true;
    };

const getReservationDetails = async (id) => {
      const Reservation = await ReservationRepo.findReservationById(id);
      if (!Reservation) return null;
      return reservationsFormatter(Reservation);
    };





const getUserReservations = async ({ timezone, page, limit, keyword, status, userId, organizationsId, date, range, reservationStatus,reservationId }) => {
      const skip = limit === 0 ? 0 : (page - 1) * limit;
      const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
      let { reservations, meta } = await ReservationRepo.getUserReservations({ timezone, page, limit, keyword, status, userId, organizationsId, date, range, today, skip, reservationStatus, reservationId });

      return {
        reservations,
        meta
      };
    };

const updateUserReservationStatus = async (id, value) => {
      const updated = await UserReservations.findByIdAndUpdate(id, {
        reservationStatus: value,
      });
      if (!updated) return null;
      return true;
    };



const updateUserReservation = async (data) => {
  const UserReservation = await ReservationRepo.findUserReservationById(data.id);
  const User = await ReservationRepo.findUserById(data.userId);


  // -----------------------------
  // ALLOWED FIELDS
  // -----------------------------
  const allowedFields = [
    "firstName",
    "lastName",
    "phoneNumber",
    "partySize",
    "reservationType",
    "timingSlots",

  ];

  // -----------------------------
  // TIMING SLOTS UPDATE
  // -----------------------------
  if (data.timingSlots) {
    if (!UserReservation.timingSlots) {
      UserReservation.timingSlots = { enabled: false, dateTimeSlots: [] };
    }

    if (data.timingSlots.enabled !== undefined) {
      UserReservation.timingSlots.enabled = data.timingSlots.enabled;
    }

    if (Array.isArray(data.timingSlots.dateTimeSlots)) {
      // Directly update the dateTimeSlots without any date conversion
      UserReservation.timingSlots.dateTimeSlots = data.timingSlots.dateTimeSlots;
    }
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

  if (Object.keys(updateData).length === 0) {
    return UserReservation;
  }
    if (data.firstName || data.lastName || data.phoneNumber) {
    const updateUserData = {};
    if (data.firstName) updateUserData.firstName = data.firstName;
    if (data.lastName) updateUserData.lastName = data.lastName;
    if (data.phoneNumber) updateUserData.phoneNumber = data.phoneNumber;

    // Update the user details
    Object.assign(User, updateUserData);
    await User.save();
  }

  // Apply updates to the reservation
  Object.assign(UserReservation, updateData);
  await UserReservation.save();

  return { message: "Reservation updated successfully", reservation: UserReservation };
};


  module.exports = {
    createGlobalReferral,
    getGlobalReferrals,
    updateGlobalReferral,
    // getReservationDetails,
    // deleteReservation,
    // getUserReservations,
    // updateUserReservationStatus,
    // updateUserReservation
    deleteGlobalReferral
  };