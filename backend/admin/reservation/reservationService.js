// services/reservationservice.js
const { buildKeywordQueryFromModels } = require("../../helperUtils/dbUtils/queryUtil");
const { generateMeta, getCurrentDateInTimezone } = require("../../helperUtils/responseUtil");
const { reservationsFormatter } = require("./formaters/reservationFormetter");
const Reservations = require("@ReservationsModel");
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
const getReservations = async ({ timezone,page, limit, keyword, status, userId, organizationsId, date, range }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({timezone,isDateOnly:true});
  let {reservations,meta} = await ReservationRepo.getReservations( { timezone,page, limit, keyword, status, userId, organizationsId, date, range,today,skip } );

  return {
    reservations,
    meta
  };
};

const updateReservation = async (id, data) => {
  const Reservation = await ReservationRepo.findReservationById(id);
    if (Reservation.conditionType !== data.conditionType && (data.amount === undefined || data.amount === null) &&! (data.conditionType === "ticketRequirement" || data.conditionType === "noCondition"|| data.conditionType === "customText")) {
    return { error: "amount_is_required_when_conditionType_changes." };
  }
      if (data.conditionType == "ticketRequirement" && (data.ticketType === undefined || data.ticketType === null) ) {
    return { error: "ticket_type_is_required_when_conditionType_is_ticketRequirement." };
  }
        if (data.conditionType == "customText" && (data.customText === undefined || data.customText === null) ) {
    return { error: "custom_text_is_required_when_conditionType_is_customText." };
  }

  if (!Reservation) return null;

  const allowedFields = [
    "title",
  "availableReservations",
  "maxCapacityPerReservation",
  "conditionType",
  "amount",
  "minimumSpend",
  "prepayAmount",
  "ticketType",
  "customText",
  "taxPercentage",
  "needsConfirmation",
  "optionalEventId",
  "status",
  "organizationId"
  ];
  const updateData = {};
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return Reservation; // nothing to update
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

module.exports = {
  createReservation,
  getReservations,
  updateReservation,
  getReservationDetails,
  deleteReservation,
};