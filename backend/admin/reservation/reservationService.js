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
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { reservations, meta } = await ReservationRepo.getReservations({ timezone, page, limit, keyword, status, userId, organizationsId, date, range, today, skip });

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

  if (Reservation.conditionType !== data.conditionType) {
    if (data.conditionType === "minimumSpendOnLocation") {
      if (!(data.amount || data.customText)) {
        return { error: "amount_or_customText_is_required_when_conditionType_changes_to_minimumSpendOnLocation." };
      }
    } else if (!data.amount) {
      return { error: "amount_is_required_when_conditionType_changes_and_is_not_minimumSpendOnLocation." };
    }
  }
  if (!Reservation) {
    return { error: "Reservation_not_found" };
  }

  if (Reservation.conditionType !== data.conditionType) {
    if (data.conditionType === "minimumSpendOnLocation") {
      if (!(data.amount || data.customText)) {
        return { error: "amount_or_customText_is_required_when_conditionType_changes_to_minimumSpendOnLocation." };
      }
    } else if (!data.amount) {
      return { error: "amount_is_required_when_conditionType_changes_and_is_not_minimumSpendOnLocation." };
    }
  }

  // Ensure ticketType is provided when conditionType is 'ticketRequirement'
  if (data.conditionType === "ticketRequirement" && (data.ticketType === undefined || data.ticketType === null)) {
    // Ensure ticketType is provided when conditionType is 'ticketRequirement'
    if (data.conditionType === "ticketRequirement" && (data.ticketType === undefined || data.ticketType === null)) {
      return { error: "ticket_type_is_required_when_conditionType_is_ticketRequirement." };
    }

    // Ensure customText is provided when conditionType is 'customText'
    if (data.conditionType === "customText" && (data.customText === undefined || data.customText === null)) {

      // Ensure customText is provided when conditionType is 'customText'
      if (data.conditionType === "customText" && (data.customText === undefined || data.customText === null)) {
        return { error: "custom_text_is_required_when_conditionType_is_customText." };
      }

      // Allowed fields for update
      // Allowed fields for update
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
        "organizationId"
      ];

      // Handle timingSlots
      if (data.timingSlots) {
        if (!Reservation.timingSlots) Reservation.timingSlots = { enabled: false, dateTimeSlots: [] };

        if (data.timingSlots.enabled !== undefined) {
          Reservation.timingSlots.enabled = data.timingSlots.enabled;
        }

        if (Array.isArray(data.timingSlots.dateTimeSlots)) {
          Reservation.timingSlots.dateTimeSlots = data.timingSlots.dateTimeSlots;
        }
      }

      // Prepare update data

      // Handle timingSlots
      if (data.timingSlots) {
        if (!Reservation.timingSlots) Reservation.timingSlots = { enabled: false, dateTimeSlots: [] };

        if (data.timingSlots.enabled !== undefined) {
          Reservation.timingSlots.enabled = data.timingSlots.enabled;
        }

        if (Array.isArray(data.timingSlots.dateTimeSlots)) {
          Reservation.timingSlots.dateTimeSlots = data.timingSlots.dateTimeSlots;
        }
      }

      // Prepare update data
      const updateData = {};
      for (const key of allowedFields) {
        if (data[key] !== undefined) {
          updateData[key] = data[key];
        }
      }

      // If there's nothing to update, return the reservation as is
      // If there's nothing to update, return the reservation as is
      if (Object.keys(updateData).length === 0) {
        return Reservation; // nothing to update
      }

      // Update the reservation
      // Update the reservation
      Object.assign(Reservation, updateData);
      await Reservation.save();

      // Return the formatted reservation
      // Return the formatted reservation
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





    const getUserReservations = async ({ timezone, page, limit, keyword, status, userId, organizationsId, date, range, reservationStatus }) => {
      const skip = limit === 0 ? 0 : (page - 1) * limit;
      const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
      let { reservations, meta } = await ReservationRepo.getUserReservations({ timezone, page, limit, keyword, status, userId, organizationsId, date, range, today, skip, reservationStatus });

      return {
        reservations,
        meta
      };
    };

    const updateUserReservation = async (id, value) => {
      const updated = await UserReservations.findByIdAndUpdate(id, {
        reservationStatus: value,
      });
      if (!updated) return null;
      return true;
    };
  }

  module.exports = {
    createReservation,
    getReservations,
    updateReservation,
    // getReservationDetails,
    // deleteReservation,
    // getUserReservations,
    // updateUserReservation,
  };
}