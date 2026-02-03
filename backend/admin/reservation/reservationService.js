// services/reservationservice.js
const { buildKeywordQueryFromModels } = require("../../helperUtils/dbUtils/queryUtil");
const { generateMeta, getCurrentDateInTimezone } = require("../../helperUtils/responseUtil");
const { reservationsFormatter, userReservationsFormatter } = require("../../app/reservations/formaters/reservationFormetter");
const { userReservationFormatterAdjustDates } = require("./formatters/userReservationFormatterAdjustDates");
const Reservations = require("@ReservationsModel");
const { UserReservations } = require("@UserReservationsModel");
const ReservationRepo = require("./reservationRepository");
const mongoose = require("mongoose");
const moment = require("moment-timezone");
const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
  convertTimezoneToUtc,
  getStartAndEndOfMonth,
  getStartAndEndOfWeek,
} = require("@utils/responseUtil");
const { cloneTimingSlots } = require("./utils/cloneTimingSlots");
const { cloneSingleSlot } = require("./utils/cloneSingleSlot");

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
  console.log("data", data);
  // -----------------------------
  // VALIDATIONS
  // -----------------------------
  if (data.conditionType) {
    if (Reservation.conditionType !== data.conditionType) {
      if (data.conditionType === "minimumSpendOnLocation") {
        if (!data.amount && !data.customText) {
          return { error: "amount_or_customText_is_required_when_conditionType_changes_to_minimumSpendOnLocation." };
        }
        else if (!data.amount) {
          return { error: "amount_is_required_when_conditionType_changes_and_is_not_minimumSpendOnLocation." };
        }
      }
    }

      if (data.conditionType === "ticketRequirement" && !data.ticketType) {
        return { error: "ticket_type_is_required_when_conditionType_is_ticketRequirement." };
      }

      if (data.conditionType === "customText" && !data.customText) {
        return { error: "custom_text_is_required_when_conditionType_is_customText." };
      }
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
      "reservationType",
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
    console.log("updateData", updateData);

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





  const getUserReservations = async ({ timezone, page, limit, keyword, status, userId, organizationsId, date, range, reservationId }) => {
    const skip = limit === 0 ? 0 : (page - 1) * limit;
    const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
    let { reservations, meta } = await ReservationRepo.getUserReservations({ timezone, page, limit, keyword, status, userId, organizationsId, date, range, today, skip, reservationId });

    return {
      reservations,
      meta
    };
  };

  const updateUserReservationStatus = async (id, value) => {
    const updated = await UserReservations.findByIdAndUpdate(id, {
      status: value,
    });
    if (!updated) return null;
    return true;
  };



  const updateUserReservation = async (data) => {
    const UserReservation = await ReservationRepo.findUserReservationById(data.id);


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

    Object.assign(UserReservation, updateData);

    await UserReservation.save();

    return {
      message: "Reservation updated successfully",
      reservation: UserReservation
    };
  };


  const getCalendarReservationsService = async ({ timezone, companyOrganizer, organization, date }) => {
    let { reservations } = await ReservationRepo.getCalendarReservations({ timezone, companyOrganizer, organization, date, });

    return {
      reservations,
    };
  };


  const copyUserReservations = async ({
    reservations,
    dates,
    timezone,
    copiedBy,
  }) => {
    const reservationIds = reservations.map(
      (id) => new mongoose.Types.ObjectId(id)
    );

    // 1️⃣ Fetch source reservations
    const sourceReservations =
      await ReservationRepo.findUserReservationsByIds(reservationIds);

    if (!sourceReservations.length) {
      throw new Error("No reservations found to copy");
    }

    const docsToInsert = [];

    // 2️⃣ Clone per date
    for (const source of sourceReservations) {
      for (const targetDate of dates) {
        const cloned = { ...source };

        // ❌ Remove Mongo-managed fields
        cloned.transferHistory = [];
        delete cloned._id;
        delete cloned.createdAt;
        delete cloned.updatedAt;
        delete cloned.__v;

        // ✅ Optional audit metadata
        cloned.clonedFromReservationId = source._id;
        cloned.clonedBy = copiedBy;

        // ✅ Update timing slots (date + times)
        cloned.timingSlots = cloneTimingSlots({
          timingSlots: source.timingSlots,
          targetDate,
          timezone,
        });

        docsToInsert.push(cloned);
      }
    }

    // 3️⃣ Bulk insert
    let reservationsItems = await ReservationRepo.insertUserReservations(docsToInsert);
    return reservationsItems.map((res) => reservationsFormatter(res, timezone));
  };


  const copyReservationSlots = async ({
    reservationIds,
    targetDate,
    startTime,
    reservationType,
    timezone,
    copiedBy,
  }) => {
    if (!Array.isArray(reservationIds) || reservationIds.length === 0) {
      throw new Error("reservationIds must be a non-empty array");
    }

    /* --------------------------------
       1️⃣ Convert to ObjectIds
       -------------------------------- */
    const objectIds = reservationIds.map(
      (id) => new mongoose.Types.ObjectId(id)
    );

    /* --------------------------------
       2️⃣ Fetch all reservations at once
       -------------------------------- */
    const sources =
      await ReservationRepo.findUserReservationsByIdsLean(objectIds);
    /* --------------------------------
       3️⃣ Validate all exist
       -------------------------------- */
    if (sources.length !== reservationIds.length) {
      const foundIds = sources.map((s) => s._id.toString());
      const missingIds = reservationIds.filter(
        (id) => !foundIds.includes(id)
      );

      throw new Error(
        `Reservations not found: ${missingIds.join(", ")}`
      );
    }

    /* --------------------------------
       4️⃣ Clone reservations
       -------------------------------- */
    const docsToInsert = [];

    for (const source of sources) {
      const cloned = { ...source };

      // ❌ Remove Mongo-managed fields
      delete cloned._id;
      delete cloned.createdAt;
      delete cloned.updatedAt;
      delete cloned.__v;

      // ✅ Update business fields
      // cloned.reservationType = reservationType;
      const reservationId = await ReservationRepo.getReservationTypeId(reservationType);
      cloned.reservationId = reservationId;
      cloned.transferHistory = [];
      cloned.clonedFromReservationId = source._id;
      cloned.clonedBy = copiedBy;

      // ✅ Clone only one slot
      cloned.timingSlots = cloneSingleSlot({
        timingSlots: source.timingSlots,
        targetDate,
        startTime,
        timezone,
      });

      docsToInsert.push(cloned);
    }

    /* --------------------------------
       5️⃣ Bulk Insert
       -------------------------------- */
    const insertedReservations =
      await ReservationRepo.insertManyUserReservations(docsToInsert);

    //TODO notify user about time change

    /* --------------------------------
       6️⃣ Format response
       -------------------------------- */
    return insertedReservations.map((reservation) =>
      reservationsFormatter(reservation, timezone)
    );
  };



  const changeUsersReservationsTiming = async ({
    reservationIds,
    startTime,
    endTime,
    timezone,
  }) => {
    if (!Array.isArray(reservationIds) || reservationIds.length === 0) {
      throw new Error("reservationIds must be a non-empty array");
    }

    const objectIds = reservationIds.map(
      (id) => new mongoose.Types.ObjectId(id)
    );

    /* --------------------------------
       1️⃣ Fetch reservations
       -------------------------------- */
    const reservations =
      await ReservationRepo.findUserReservationsByIds(objectIds);

    if (!reservations.length) {
      throw new Error("Reservations not found");
    }

    /* --------------------------------
       2️⃣ Prepare bulk operations
       -------------------------------- */
    const bulkOps = [];
    const updatedDocs = [];

    for (const reservation of reservations) {
      if (!reservation.timingSlots?.dateTimeSlots?.length) continue;

      const block = reservation.timingSlots.dateTimeSlots[0];
      const slot = block.timeSlots[0];
      if (!slot) continue;

      const slotDate = moment(block.date)
        .tz(timezone)
        .format("YYYY-MM-DD");

      const newStart = moment
        .tz(`${slotDate} ${startTime}`, "YYYY-MM-DD hh:mm A", timezone)
        .utc()
        .toDate();

      const newEnd = moment
        .tz(`${slotDate} ${endTime}`, "YYYY-MM-DD hh:mm A", timezone)
        .utc()
        .toDate();

      bulkOps.push({
        updateOne: {
          filter: { _id: reservation._id },
          update: {
            $set: {
              "timingSlots.dateTimeSlots.0.timeSlots.0.startTime": newStart,
              "timingSlots.dateTimeSlots.0.timeSlots.0.endTime": newEnd,
            },
          },
        },
      });

      // Keep local copy for formatting later
      reservation.timingSlots.dateTimeSlots[0].timeSlots[0].startTime = newStart;
      reservation.timingSlots.dateTimeSlots[0].timeSlots[0].endTime = newEnd;

      updatedDocs.push(reservation);
    }

    /* --------------------------------
       3️⃣ Execute bulk update
       -------------------------------- */
    if (bulkOps.length) {
      //TODO notify user about time change
      await ReservationRepo.bulkUpdateUserReservations(bulkOps);
    }

    /* --------------------------------
       4️⃣ Format response
       -------------------------------- */
    return updatedDocs.map((item) =>
      userReservationFormatterAdjustDates(item, timezone)
    );
  };


  module.exports = {
    copyReservationSlots,
    createReservation,
    getReservations,
    updateReservation,
    getReservationDetails,
    deleteReservation,
    getUserReservations,
    updateUserReservationStatus,
    updateUserReservation,
    getavailableReservations,
    getCalendarReservationsService,
    copyUserReservations,
    changeUsersReservationsTiming
  };