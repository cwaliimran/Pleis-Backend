// services/reservationservice.js
const {
  buildKeywordQueryFromModels,
} = require("../../helperUtils/dbUtils/queryUtil");
const {
  generateMeta,
  getCurrentDateInTimezone,
  fireAndForget,
} = require("../../helperUtils/responseUtil");
const {
  reservationsFormatter,
  userReservationsFormatter,
} = require("../../app/reservations/formaters/reservationFormetter");
const {
  userReservationFormatterAdjustDates,
} = require("./formatters/userReservationFormatterAdjustDates");
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
const {
  sendUserNotifications,
} = require("../../controllers/communicationController");
const { NotificationTypes } = require("../../models/Notifications");
const { getActiveEventsForOrg } = require("../events/eventRepository");
const {
  EventCheckins,
} = require("../../commonModules/events/EventCheckinsModel");
const {
  formatReservationDates,
} = require("./formatters/reservationDateFormatter");

const createReservation = async (data) => {
  let Reservation = await ReservationRepo.createReservation(data);
  return reservationsFormatter(Reservation);
};

// Populate venue data for reservations (updated for new schema)
const getReservations = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  userId,
  organizationsId,
  date,
  range,
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  let { reservations, meta } = await ReservationRepo.getReservations({
    timezone,
    page,
    limit,
    keyword,
    status,
    userId,
    organizationsId,
    date,
    range,
    skip,
  });

  return {
    reservations,
    meta,
  };
};
const getavailableReservations = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  userId,
  organizationsId,
  date,
  range,
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  let { reservations, meta } = await ReservationRepo.getavailableReservations({
    timezone,
    page,
    limit,
    keyword,
    status,
    userId,
    organizationsId,
    date,
    range,
    skip,
  });

  return {
    reservations,
    meta,
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
  if (data.conditionType) {
    // Utility for null/undefined check
    const isNil = (v) => v === null || v === undefined;

    // Optional normalization (prevents "" issues from frontend)
    if (data.amount === "") data.amount = null;
    if (data.customText === "") data.customText = null;

    const amountMissing = isNil(data.amount);
    const customTextMissing = !data.customText;

    // Condition type changed
    if (Reservation.conditionType !== data.conditionType) {
      if (data.conditionType === "minimumSpendOnLocation") {
        if (amountMissing && customTextMissing) {
          return {
            error:
              "amount_or_customText_is_required_when_conditionType_changes_to_minimumSpendOnLocation.",
          };
        }

        if (amountMissing) {
          return {
            error:
              "amount_is_required_when_conditionType_changes_and_is_not_minimumSpendOnLocation.",
          };
        }
      }
    }

    // Ticket requirement validation
    if (data.conditionType === "ticketRequirement" && !data.ticketType) {
      return {
        error:
          "ticket_type_is_required_when_conditionType_is_ticketRequirement.",
      };
    }

    // Custom text validation
    if (data.conditionType === "customText" && !data.customText) {
      return {
        error: "custom_text_is_required_when_conditionType_is_customText.",
      };
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
    "bonusPoints",
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

const getUserReservations = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  userId,
  organizationsId,
  date,
  range,
  reservationId,
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { reservations, meta } = await ReservationRepo.getUserReservations({
    timezone,
    page,
    limit,
    keyword,
    status,
    userId,
    organizationsId,
    date,
    range,
    today,
    skip,
    reservationId,
  });

  return {
    reservations,
    meta,
  };
};

const updateUserReservationStatus = async (id, value, changedBy) => {
  const now = new Date();

  //find find reservation type and get minimum spend if they amount is >0 then it should change status to
  const userReservation = await UserReservations.findById(id);
  if (!userReservation) return null;
  let lockUntil = null;
  if (userReservation.status === "pendingPayment") {
    //lock for 30 minutes
    lockUntil = new Date(Date.now() + 30 * 60 * 1000);
  }

  const updated = await UserReservations.findByIdAndUpdate(
    id,
    {
      $set: {
        status: value,
        ...(lockUntil ? { lockUntil } : {}),
      },
      $push: {
        reservationChanges: {
          changedBy: changedBy ? new mongoose.Types.ObjectId(changedBy) : null,
          action: "reservationStatusChanged",
          oldValue: userReservation.status,
          newValue: value,
          reason: "Reservation status updated by organizer",
          createdAt: now,
        },
      },
    },
    {
      new: true,
      runValidators: true,
    },
  );

  if (!updated) return null;

  if (value === "checkedIn") {
    fireAndForget(
      (async () => {
        const reservation = updated;

        let events = [];

        if (reservation.optionalEventId) {
          events = [
            {
              _id: reservation.optionalEventId,
              companyOrganizer: reservation.companyOrganizer,
            },
          ];
        } else {
          events = await getActiveEventsForOrg(reservation.organizationId, now);
        }

        if (!events.length || !reservation.userId) return;

        const ops = events.map((event) => ({
          updateOne: {
            filter: {
              event: event._id,
              user: reservation.userId,
            },
            update: {
              $setOnInsert: {
                organization: reservation.organizationId,
                companyOrganizer: event.companyOrganizer,
                source: "reservation",
                checkedInAt: now,
              },
            },
            upsert: true,
          },
        }));

        await EventCheckins.bulkWrite(ops, { ordered: false });
      })(),
      "RESERVATION_EVENT_CHECKIN",
    );
  }

  //notify user about the reservation status change
  // fireAndForget(async () => {
  //    sendUserNotifications({
  //     recipientIds: [userReservation.userId.toString()],
  //     title: "Reservation " + value,
  //     body:
  //       value === "confirmed"
  //         ? "Your reservation has been confirmed"
  //         : value === "cancelled"
  //         ? "Your reservation has been cancelled"
  //         : value === "checkedIn"
  //         ? "Your reservation has been checked in"
  //         : value === "rejected"
  //         ? "Your reservation has been rejected"
  //         : value === "needsConfirmation"
  //         ? "Your reservation needs confirmation"
  //         : value === "pendingPayment"
  //         ? "Your reservation is pending payment"
  //         : value === "completed"
  //         ? "Your reservation has been completed"
  //         : "Your reservation status has been changed to " + value,
  //     data: {
  //       type: NotificationTypes.RESERVATION_UPDATE,
  //       objectType: "userreservations",
  //     },
  //     sender: changedBy ? changedBy.toString() : userReservation.companyOrganizer?.toString() || null,
  //     objectId: userReservation._id?.toString() || null,
  //   }).catch((err) => console.error("Error sending notifications in background:"));
  // }, "RESERVATION_STATUS_CHANGE");
  return true;
};

const updateUserReservation = async (data) => {
  const UserReservation = await ReservationRepo.findUserReservationById(
    data.id,
  );

  if (!UserReservation) return null;

  const allowedFields = [
    "firstName",
    "lastName",
    "phoneNumber",
    "partySize",
    "reservationType",
    "timingSlots",
    "notes",
    "numberOfTables",
    "conditionType",
    "amount",
    "email",
    "status",
  ];

  // -----------------------------
  // Detect timing change
  // -----------------------------
  let oldTiming = null;
  let timingChanged = false;

  if (data.timingSlots) {
    oldTiming = JSON.parse(JSON.stringify(UserReservation.timingSlots));

    if (!UserReservation.timingSlots) {
      UserReservation.timingSlots = {
        enabled: false,
        dateTimeSlots: [],
      };
    }

    if (data.timingSlots.enabled !== undefined) {
      UserReservation.timingSlots.enabled = data.timingSlots.enabled;
    }

    if (Array.isArray(data.timingSlots.dateTimeSlots)) {
      UserReservation.timingSlots.dateTimeSlots =
        data.timingSlots.dateTimeSlots;
    }

    timingChanged = true;
  }

  // -----------------------------
  // Apply simple updates
  // -----------------------------
  const updateData = {};
  for (const key of allowedFields) {
    if (data[key] !== undefined && key !== "timingSlots") {
      updateData[key] = data[key];
    }
  }

  Object.assign(UserReservation, updateData);

  // -----------------------------
  // Save history if timing changed
  // -----------------------------
  if (timingChanged) {
    UserReservation.reservationChanges =
      UserReservation.reservationChanges || [];

    UserReservation.reservationChanges.push({
      changedBy: data.userId || null,
      oldTiming,
      newTiming: UserReservation.timingSlots,
      action: "timingChanged",
      status: "completed",
      createdAt: new Date(),
    });
  }

  await UserReservation.save();

  // -----------------------------
  // Notify user
  // -----------------------------
  if (UserReservation.userId) {
    await sendUserNotifications({
      recipientIds: [UserReservation.userId.toString()],
      title: "Reservation Updated",
      body: timingChanged
        ? "Your reservation timing has been updated."
        : "Your reservation details have been updated.",

      data: {
        type: NotificationTypes.RESERVATION_UPDATE,
        objectType: "userreservations",
      },

      sender: data.userId,
      objectId: UserReservation._id,
    });
  }

  return {
    message: "Reservation updated successfully",
    reservation: UserReservation,
  };
};

const getCalendarReservationsService = async ({
  timezone,
  companyOrganizer,
  organization,
  date,
}) => {
  let { reservations } = await ReservationRepo.getCalendarReservations({
    timezone,
    companyOrganizer,
    organization,
    date,
  });

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
    (id) => new mongoose.Types.ObjectId(id),
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
  let reservationsItems =
    await ReservationRepo.insertUserReservations(docsToInsert);
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
  const objectIds = reservationIds.map((id) => new mongoose.Types.ObjectId(id));

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
    const missingIds = reservationIds.filter((id) => !foundIds.includes(id));

    throw new Error(`Reservations not found: ${missingIds.join(", ")}`);
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
    const reservationId =
      await ReservationRepo.getReservationTypeId(reservationType);
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
    reservationsFormatter(reservation, timezone),
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

  const objectIds = reservationIds.map((id) => new mongoose.Types.ObjectId(id));

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

    // Save old timing
    const oldTiming = JSON.parse(JSON.stringify(reservation.timingSlots));

    const slotDate = moment(block.date).tz(timezone).format("YYYY-MM-DD");

    const newStart = moment
      .tz(`${slotDate} ${startTime}`, "YYYY-MM-DD hh:mm A", timezone)
      .utc()
      .toDate();

    const newEnd = moment
      .tz(`${slotDate} ${endTime}`, "YYYY-MM-DD hh:mm A", timezone)
      .utc()
      .toDate();

    // Apply new timing locally
    reservation.timingSlots.dateTimeSlots[0].timeSlots[0].startTime = newStart;
    reservation.timingSlots.dateTimeSlots[0].timeSlots[0].endTime = newEnd;

    // Save change history
    reservation.reservationChanges = reservation.reservationChanges || [];

    reservation.reservationChanges.push({
      changedBy: reservation.companyOrganizer,
      oldTiming,
      newTiming: reservation.timingSlots,
      action: "timingChanged",
      status: "pending",
      createdAt: new Date(),
    });

    bulkOps.push({
      updateOne: {
        filter: { _id: reservation._id },
        update: {
          $set: {
            timingSlots: reservation.timingSlots,
          },
          $push: {
            reservationChanges: {
              changedBy: reservation.companyOrganizer,
              oldValue: oldTiming,
              newValue: reservation.timingSlots,
              action: "timingChanged",
              reason: "Reservation timing updated by organizer",
              createdAt: new Date(),
            },
          },
        },
      },
    });

    updatedDocs.push(reservation);
  }

  /* --------------------------------
     3️⃣ Execute bulk update
     -------------------------------- */
  if (bulkOps.length) {
    //TODO notify user about time change
    await ReservationRepo.bulkUpdateUserReservations(bulkOps);
  }

  const recipientIds = reservations
    .map((r) => r.userId)
    .filter(Boolean)
    .map((id) => id.toString());

  if (recipientIds.length) {
    sendUserNotifications({
      recipientIds,
      title: "Reservation Time Updated",
      body: "Your reservation timing has been updated.",
      data: {
        type: NotificationTypes.RESERVATION_UPDATE,
        objectType: "userreservations",
      },
      sender: reservations[0]?.companyOrganizer?.toString() || null,
      objectId: reservations[0]?._id?.toString() || null,
    })
      .then(() => {})
      .catch((err) =>
        console.error("Error sending notifications in background:", err),
      );
  }

  /* --------------------------------
     4️⃣ Format response
     -------------------------------- */
  return updatedDocs.map((item) =>
    userReservationFormatterAdjustDates(item, timezone),
  );
};
const combineDateTime = (date, time, timezone) => {
  const combined = `${date} ${time}`;
  return convertTimezoneToUtc(combined, timezone, "YYYY-MM-DD HH:mm");
};
const getReservationsV2 = async ({
  page,
  limit,
  status,
  companyOrganizer,
  organizationsId,
  date,
  timezone,
  reservationType,
  startTime,
}) => {
  let endTime = null;
if (date && startTime) {
  startTime = combineDateTime(date, startTime, timezone);

  endTime = moment
    .utc(startTime)
    .add(1, "hour")
    .format("YYYY-MM-DDTHH:mm:ss.SSSZ");
}
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  let { reservations, meta } = await ReservationRepo.getReservationsV2({
    page,
    limit,
    status,
    companyOrganizer,
    organizationsId,
    date,
    skip,
    timezone,
    reservationType,
    startTime,
    endTime,
  });

  return {
    reservations: formatReservationDates(reservations, timezone),
    meta,
  };
};

const getWeekRange = (date) => {
  const start = moment.utc(date).startOf("isoWeek").toDate();
  const end = moment.utc(date).endOf("isoWeek").toDate();
  return { start, end };
};
const getReservationsV2Calender = async ({
  timezone,
  companyOrganizer,
  organization,
  date,
}) => {
  const { start, end } = getWeekRange(date);
  let { reservations, meta } = await ReservationRepo.getReservationsV2Calender({
    timezone,
    companyOrganizer,
    organization,
    start,
    end,
  });
  return {
    reservations: formatReservationDates(reservations, timezone),
    meta,
  };
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
  changeUsersReservationsTiming,
  getReservationsV2,
  getReservationsV2Calender,
};
