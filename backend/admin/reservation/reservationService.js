// services/reservationservice.js
const { buildKeywordQueryFromModels } = require("../../helperUtils/dbUtils/queryUtil");
const { generateMeta, getCurrentDateInTimezone } = require("../../helperUtils/responseUtil");
const { reservationsFormatter } = require("../../app/reservations/formaters/reservationFormetter");
const Reservations = require("@ReservationsModel");
const UserReservations = require("@UserReservationsModel");
const ReservationRepo = require("./reservationRepository");
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

const createReservation = async (data) => {
  let Reservation = await ReservationRepo.createReservation(data);
  return reservationsFormatter(Reservation);
};

// Populate venue data for reservations (updated for new schema)
const getReservations = async ({ timezone, page, limit, keyword, status, userId, organizationsId, date, range }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  let { reservations, meta } = await ReservationRepo.getReservations({ timezone, page, limit, keyword, status, userId, organizationsId, date, range, skip });

  return {
    reservations,
    meta
  };
};
const getavailableReservations = async ({ timezone, page, limit, keyword, status, userId, organizationsId, date, range }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  let { reservations, meta } = await ReservationRepo.getavailableReservations({ timezone, page, limit, keyword, status, userId, organizationsId, date, range, skip });

  return {
    reservations,
    meta
  };
};
const updateReservation = async (id, data) => {
  const Reservation = await ReservationRepo.findReservationById(id);
  if (!Reservation) {
    return { error: "Reservation_not_found" };
  }

  // -----------------------------
  // VALIDATIONS
  // -----------------------------
  if (Reservation.conditionType !== data.conditionType) {
    if (data.conditionType === "minimumSpendOnLocation") {
      if (!data.amount && !data.customText) {
        return { error: "amount_or_customText_is_required_when_conditionType_changes_to_minimumSpendOnLocation." };
      }
    } else if (!data.amount) {
      return { error: "amount_is_required_when_conditionType_changes_and_is_not_minimumSpendOnLocation." };
    }
  }

  if (data.conditionType === "ticketRequirement" && !data.ticketType) {
    return { error: "ticket_type_is_required_when_conditionType_is_ticketRequirement." };
  }

  if (data.conditionType === "customText" && !data.customText) {
    return { error: "custom_text_is_required_when_conditionType_is_customText." };
  }

  // -----------------------------
  // ALLOWED FIELDS
  // -----------------------------
  const allowedFields = [
    "name",
    "availableReservations",
    "maxCapacityPerReservation",
    "conditionType",
    "amount",
    "minimumSpend",
    "prepayAmount",
    "ticketType",
    "customText",
    "timingSlots",
    "taxPercentage",
    "needsConfirmation",
    "optionalEventId",
    "status",
    "organizationId",
    "notes",
  ];

  // -----------------------------
  // TIMING SLOTS UPDATE
  // -----------------------------
  if (data.timingSlots) {
    if (!Reservation.timingSlots) {
      Reservation.timingSlots = { enabled: false, dateTimeSlots: [] };
    }

    if (data.timingSlots.enabled !== undefined) {
      Reservation.timingSlots.enabled = data.timingSlots.enabled;
    }

    if (Array.isArray(data.timingSlots.dateTimeSlots)) {
      Reservation.timingSlots.dateTimeSlots = data.timingSlots.dateTimeSlots;
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
    return Reservation;
  }

  Object.assign(Reservation, updateData);
  await Reservation.save();

  return reservationsFormatter(Reservation);
};

  const deleteReservation = async (id) => {
      const updated = await ReservationRepo.findByIdAndUpdate(id, {
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

console.log("UserReservation", UserReservation);
  const allowedFields = [
    "firstName",
    "lastName",
    "phoneNumber",
    "partySize",
    "reservationType",
    "timingSlots",
    "notes",
  ];

  if (data.timingSlots) {
    if (!UserReservation.timingSlots) {
      UserReservation.timingSlots = { enabled: false, dateTimeSlots: [] };
    }

    if (data.timingSlots.enabled !== undefined) {
      UserReservation.timingSlots.enabled = data.timingSlots.enabled;
    }

    if (Array.isArray(data.timingSlots.dateTimeSlots)) {
      UserReservation.timingSlots.dateTimeSlots = data.timingSlots.dateTimeSlots;
    }
  }

  const updateData = {};
  for (const key of allowedFields) {
    if (data[key] !== undefined && key !== "timingSlots") {
      updateData[key] = data[key];
    }
  }
console.log("updateData",updateData );
  Object.assign(UserReservation, updateData);

  await UserReservation.save();

  return {
    message: "Reservation updated successfully",
    reservation: UserReservation
  };
};


  module.exports = {
    createReservation,
    getReservations,
    updateReservation,
    getReservationDetails,
    deleteReservation,
    getUserReservations,
    updateUserReservationStatus,
    updateUserReservation,
    getavailableReservations
  };