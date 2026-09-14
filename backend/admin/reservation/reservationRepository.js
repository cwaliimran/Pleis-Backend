// repositories/ReservationRepository.js
const Reservations = require("@ReservationsModel");
const { UserReservations } = require("@UserReservationsModel");
const { User } = require("../../models/UserModel");
const Event = require("@EventsModel");
const mongoose = require("mongoose");
const moment = require("moment-timezone");
const {
  reservationsFormatter,
  reservationsFormatterAdjustDates,
} = require("../../app/reservations/formaters/reservationFormetter");
const Organizations = require("@OrganizationModel");
const {
  generateMeta,
  getStartAndEndOfMonth,
  getStartAndEndOfWeek,
  getStartAndEndOfDay,
  getCurrentDateInTimezone,
  getCurrentUtcDateOnly,
} = require("../../helperUtils/responseUtil");
const { getAllUsers } = require("../usersManagement/usersService");
const { sendUserNotifications } = require("@notificationsUtil");
const { NotificationTypes } = require("@NotificationsModel");
const {
  userReservationFormatterAdjustDates,
} = require("./formatters/userReservationFormatterAdjustDates");
const {
  attachUserLevelsToReservations,
  buildClubMemberMap,
} = require("./utils/attachUserLevelsToReservations");
const {
  getClubMembersForUsers,
} = require("../../app/loyalty/clubMembers/clubMembersRepository");
const { getActiveTiersWithProjection } = require("../tiers/tiersRepository");
const ReservationType = require("@ReservationTypeModel");
// NOTE: lazy-required inside checkReservationAvailabilityForUpdate to avoid a
// circular dependency (app/reservations/reservationRepository -> orders/orderService
// -> admin/reservation/reservationRepository), which otherwise resolves this to undefined.
const getCreatorFromOrganization = async (organizationId) => {
  try {
    const result = await Organizations.aggregate([
      {
        $match: { _id: new mongoose.Types.ObjectId(organizationId) }, // Match the organization by its ID
      },
      {
        $lookup: {
          from: "users", // Assuming the 'creator' is in the 'users' collection
          localField: "creator", // Field in the 'organizations' collection that references the creator
          foreignField: "_id", // Field in the 'users' collection to match with
          as: "creatorDetails", // Alias for the resulting array of creator data
        },
      },
      {
        $unwind: { path: "$creatorDetails", preserveNullAndEmptyArrays: true }, // Unwind creator details array (if it exists)
      },
      {
        $project: {
          creatorId: "$creatorDetails._id", // Extract just the _id of the creator
          _id: 0, // Exclude the organization _id from the result
        },
      },
    ]);

    if (result.length > 0) {
      return result[0].creatorId; // Return the creator ID
    } else {
      return null; // Return null if no matching organization is found
    }
  } catch (err) {
    throw err;
  }
};
const createReservation = async (data) => {
  try {
    data.companyOrganizer = await getCreatorFromOrganization(
      data.organizationId,
    );
    const Reservation = new Reservations(data);
    await Reservation.save();
    const userIds = (await getAllUsers({ page: 1, limit: 1000000 })).users.map(
      (user) => user._id.toString(),
    );
    // await sendUserNotifications({
    //   recipientIds: userIds,
    //   title: `New Reservation Available`,
    //   body: ` A new reservation has been created. Check it out!`,
    //   data: { type: NotificationTypes.RESERVATION_UPDATE, reservationId: Reservation._id, objectType: "reservations" },
    //   sender: Reservation.companyOrganizer,
    //   objectId: Reservation._id,
    //   image: null,
    // });
    return Reservation;
  } catch (err) {
    throw err;
  }
};

// Get all Reservations with their assigned organization populated, sorted by createdAt descending
const getReservationsWithFilters = async (query = {}, skip = 0, limit = 10) => {
  return Reservations.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
};

// Count by condition
const countReservations = async (query = {}) => {
  return Reservations.countDocuments(query);
};

// Find by ID
const findReservationById = async (id) => {
  return Reservations.findById(id);
};

// Update and save
const updateReservationData = async (Reservation, data) => {
  Object.assign(Reservation, data);
  return await Reservation.save();
};

// Delete
const deleteReservationById = async (Reservation) => {
  return await Reservation.deleteOne();
};

//findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  return Reservations.findByIdAndUpdate(id, data, { new: true });
};

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
  skip,
}) => {
  const now = getCurrentDateInTimezone({ timezone });

  let organizationsIds = Array.isArray(organizationsId)
    ? organizationsId
    : JSON.parse(organizationsId || "[]");
  organizationsIds = organizationsIds.map(
    (id) => new mongoose.Types.ObjectId(id),
  );
  const pipeline = [
    {
      $match: {
        ...(userId && {
          companyOrganizer: new mongoose.Types.ObjectId(userId),
        }),
        ...(organizationsIds.length > 0 && {
          organizationId: { $in: organizationsIds },
        }), // Match as ObjectId
      },
    },
  ];
  if (range == "monthly") {
    const { start, end } = getStartAndEndOfMonth(now, timezone);

    pipeline.push({
      $match: {
        "timingSlots.dateTimeSlots": {
          $elemMatch: {
            date: { $gte: start, $lt: end },
          },
        },
      },
    });
  }
  if (range == "weekly") {
    const { start, end } = getStartAndEndOfWeek(now, timezone);

    pipeline.push({
      $match: {
        "timingSlots.dateTimeSlots": {
          $elemMatch: {
            date: { $gte: start, $lt: end },
          },
        },
      },
    });
  }
  if (range == "today") {
    const { start, end } = getStartAndEndOfDay(now, timezone);
    pipeline.push({
      $match: {
        "timingSlots.dateTimeSlots": {
          $elemMatch: {
            date: { $gte: start, $lt: end },
          },
        },
      },
    });
  }
  // Apply filters
  if (status) {
    pipeline.push({ $match: { status } });
  } else {
    pipeline.push({ $match: { status: { $ne: "deleted" } } });
  }

  if (date) {
    let { start, end } = getStartAndEndOfDay(date, timezone);
    pipeline.push({
      $match: {
        "timingSlots.dateTimeSlots": {
          $elemMatch: {
            date: { $gte: start, $lt: end },
          },
        },
      },
    });
  }

  if (keyword) {
    const keywordMatch = buildKeywordQueryFromModels(
      [{ schema: Reservations.schema }],
      keyword,
    );

    if (Object.keys(keywordMatch).length) {
      pipeline.push({ $match: keywordMatch });
    }
  }

  pipeline.push({ $sort: { createdAt: -1 } });

  // Apply pagination + counts using $facet
  pipeline.push({
    $facet: {
      data: [{ $skip: skip }, ...(limit === 0 ? [] : [{ $limit: limit }])],
      totalFiltered: [{ $count: "count" }],
    },
  });
  const result = await Reservations.aggregate(pipeline);

  let reservations = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Additional counts for meta (active/inactive/total by userId as creator)
  const [total, active, inactive] = await Promise.all([
    Reservations.countDocuments({
      ...(userId && { userId: userId }),
      status: { $ne: "deleted" },
    }),
    Reservations.countDocuments({
      status: "active",
      ...(userId && { userId: userId }),
    }),
    Reservations.countDocuments({
      status: "inactive",
      ...(userId && { userId: userId }),
    }),
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.reservationsCount = { total, active, inactive };

  reservations = reservations.map((item) => {
    const formatted = reservationsFormatter(item);
    if (
      formatted.conditionType == "noCondition" ||
      formatted.conditionType == "ticketRequirement" ||
      formatted.conditionType == "customText" ||
      formatted.conditionType == "ticketRequirement"
    ) {
      delete formatted.amount;
      if (formatted.conditionType == "noCondition") {
        delete formatted.ticketType;
      }
    } else {
      delete formatted.ticketType;
    }
    return formatted;
  });
  return { reservations, meta };
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
  skip = 0,
  reservationId,
}) => {
  const now = getCurrentDateInTimezone({ timezone });

  const pipeline = [];

  // -----------------------------
  // 1️⃣ BASE MATCH (UserReservations)
  // -----------------------------
  const match = {};

  // if (status) {
  //   match.status = status;
  // } else {
  match.status = {
    $in: [
      "pendingPayment",
      "needsConfirmation",
      "confirmed",
      "checkedIn",
      "rejected",
      "cancelled",
      "completed",
    ],
  };
  // }

  if (organizationsId) {
    match.organizationId = new mongoose.Types.ObjectId(organizationsId);
  }

  if (reservationId) {
    match.reservationId = new mongoose.Types.ObjectId(reservationId);
  }

  if (userId) {
    match.userId = new mongoose.Types.ObjectId(userId);
  }

  pipeline.push({ $match: match });

  // -----------------------------
  // 2️⃣ JOIN RESERVATION DEFINITION
  // -----------------------------
  pipeline.push(
    {
      $lookup: {
        from: "reservations",
        localField: "reservationId",
        foreignField: "_id",
        as: "reservation",
      },
    },
    {
      $unwind: {
        path: "$reservation",
        preserveNullAndEmptyArrays: true,
      },
    },
  );

  // -----------------------------
  // 3️⃣ JOIN EVENT (ObjectId ref)
  // -----------------------------
  pipeline.push(
    {
      $lookup: {
        from: "events",
        let: { eventId: "$reservation.optionalEventId" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$_id", "$$eventId"] },
            },
          },
          {
            $project: {
              _id: 1,
              "basicInfo.title": 1,
            },
          },
        ],
        as: "event",
      },
    },
    {
      $unwind: {
        path: "$event",
        preserveNullAndEmptyArrays: true,
      },
    },
  );

  // -----------------------------
  // 4️⃣ DATE RANGE FILTERS (Slots)
  // -----------------------------
  if (range === "monthly") {
    const { start, end } = getStartAndEndOfMonth(now, timezone);
    pipeline.push({
      $match: {
        "timingSlots.dateTimeSlots": {
          $elemMatch: { date: { $gte: start, $lt: end } },
        },
      },
    });
  }

  if (range === "weekly") {
    const { start, end } = getStartAndEndOfWeek(now, timezone);
    pipeline.push({
      $match: {
        "timingSlots.dateTimeSlots": {
          $elemMatch: { date: { $gte: start, $lt: end } },
        },
      },
    });
  }

  if (range === "today") {
    const { start, end } = getStartAndEndOfDay(now, timezone);
    pipeline.push({
      $match: {
        "timingSlots.dateTimeSlots": {
          $elemMatch: { date: { $gte: start, $lt: end } },
        },
      },
    });
  }

  // -----------------------------
  // 5️⃣ CREATED DATE FILTER
  // -----------------------------
  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    pipeline.push({
      $match: {
        createdAt: { $gte: start, $lt: end },
      },
    });
  }

  // -----------------------------
  // 6️⃣ KEYWORD SEARCH
  // -----------------------------
  if (keyword) {
    const keywordMatch = buildKeywordQueryFromModels(
      [{ schema: UserReservations.schema }],
      keyword,
    );

    if (Object.keys(keywordMatch).length) {
      pipeline.push({ $match: keywordMatch });
    }
  }

  // -----------------------------
  // 7️⃣ SORT
  // -----------------------------
  pipeline.push({ $sort: { createdAt: -1 } });

  // -----------------------------
  // 8️⃣ PAGINATION + TOTAL (SINGLE SOURCE)
  // -----------------------------
  pipeline.push({
    $facet: {
      data: [{ $skip: skip }, ...(limit === 0 ? [] : [{ $limit: limit }])],
      totalFiltered: [{ $count: "count" }],
    },
  });

  // -----------------------------
  // 9️⃣ EXECUTION
  // -----------------------------
  const result = await UserReservations.aggregate(pipeline);
  const userReservations = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;
  const meta = generateMeta(page, limit, totalFiltered);

  // -----------------------------
  // COLLECT IDS (DEDUPED)
  // -----------------------------

  const userIds = [
    ...new Set(
      userReservations
        .filter((r) => r.userId) // remove null/undefined
        .map((r) => r.userId.toString()),
    ),
  ].map((id) => new mongoose.Types.ObjectId(id));

  const companyOrganizers = [
    ...new Set(userReservations.map((r) => r.companyOrganizer.toString())),
  ].map((id) => new mongoose.Types.ObjectId(id));
  // -----------------------------
  // FETCH ONCE (BULK)
  // -----------------------------
  const [members, activeTiers] = await Promise.all([
    getClubMembersForUsers({ userIds, companyOrganizers }),
    getActiveTiersWithProjection({ _id: 1, title: 1 }),
  ]);

  // -----------------------------
  // BUILD TIER MAP (ID → TITLE)
  // -----------------------------
  const tierIdToTitle = {};
  for (const t of activeTiers) {
    tierIdToTitle[t._id.toString()] = t.title;
  }

  // -----------------------------
  // BUILD MEMBER MAP
  // -----------------------------
  const memberMap = buildClubMemberMap(members);

  // -----------------------------
  // ENRICH RESERVATIONS
  // -----------------------------
  const enrichedReservations = attachUserLevelsToReservations({
    reservations: userReservations,
    clubMemberMap: memberMap,
    tierIdToTitle,
  });

  // -----------------------------
  // FORMAT + RETURN
  // -----------------------------
  return {
    reservations: enrichedReservations.map((item) =>
      userReservationFormatterAdjustDates(item, timezone),
    ),
    meta,
  };
};

const findUserReservationById = async (id) => {
  return UserReservations.findById(id);
};

const findUserReservationsByIdsLean = async (ids) => {
  return UserReservations.find({
    _id: { $in: ids },
  }).lean();
};

const findUserById = async (id) => {
  return User.findById(id);
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
  skip,
}) => {
  // let now = getCurrentDateInTimezone({ timezone });
  //  date = convertTimezoneToUtcDateOnly(
  //   now,
  //   timezone
  // );

  const now = getCurrentUtcDateOnly();

  let organizationObjectIds = null;

  if (
    organizationsId &&
    organizationsId !== "undefined" &&
    organizationsId !== "null"
  ) {
    // support comma or % separated ids
    const ids = organizationsId.includes("%")
      ? organizationsId.split("%")
      : organizationsId.split(",");

    organizationObjectIds = ids
      .filter(Boolean)
      .map((id) => new mongoose.Types.ObjectId(id));
  }
  const pipeline = [
    {
      $match: {
        ...(organizationObjectIds
          ? { organizationId: { $in: organizationObjectIds } }
          : userId
            ? { companyOrganizer: new mongoose.Types.ObjectId(userId) }
            : {}),
      },
    },
  ];

  if (range == "monthly") {
    const { start, end } = getStartAndEndOfMonth(now, timezone);
    // Update the pipeline to match events within the specified date range
    pipeline.push({
      $match: {
        "timingSlots.dateTimeSlots": {
          $elemMatch: {
            date: { $gte: start, $lt: end },
          },
        },
      },
    });
  }

  if (range == "weekly") {
    // Get the start and end of the current week based on the timezone
    const { start, end } = getStartAndEndOfWeek(now, timezone);

    // Add 1 minute to the end date to capture events at the very end of the week
    const adjustedEnd = new Date(end.getTime() + 60000); // Add 1 minute to the end time

    // Update the pipeline to match events within the specified date range
    pipeline.push({
      $match: {
        "timingSlots.dateTimeSlots": {
          $elemMatch: {
            date: { $gte: start, $lt: adjustedEnd },
          },
        },
      },
    });
  }

  if (range == "today") {
    // Get the start and end of today based on the timezone
    const { start, end } = getStartAndEndOfDay(now, timezone);

    // Add 1 minute to the end date to capture events at the very end of the day
    const adjustedEnd = new Date(end.getTime() + 60000); // Add 1 minute to the end time

    // Update the pipeline to match events within the specified date range
    pipeline.push({
      $match: {
        "timingSlots.dateTimeSlots": {
          $elemMatch: {
            date: { $gte: start, $lt: adjustedEnd },
          },
        },
      },
    });
  }

  // Apply filters
  if (status) {
    pipeline.push({ $match: { status } });
  } else {
    pipeline.push({ $match: { status: { $ne: "deleted" } } });
  }

  if (date) {
    let { start, end } = getStartAndEndOfDay(date, timezone);

    // Log the start and end dates for debugging

    // Add 1 minute to the end date to capture events that are scheduled at the very last minute
    end = new Date(end.getTime() + 60000); // 60,000 ms = 1 minute

    pipeline.push({
      $match: {
        $expr: {
          $gt: [
            {
              $size: {
                $filter: {
                  input: "$timingSlots.dateTimeSlots", // Array of dateTimeSlots
                  as: "slot",
                  cond: {
                    $and: [
                      { $gte: ["$$slot.date", start] }, // Match slot date >= start date
                      { $lt: ["$$slot.date", end] }, // Match slot date < end date
                    ],
                  },
                },
              },
            },
            0,
          ],
        },
      },
    });

    // Log the pipeline for debugging
  }

  if (keyword) {
    const keywordMatch = buildKeywordQueryFromModels(
      [{ schema: Reservations.schema }],
      keyword,
    );

    if (Object.keys(keywordMatch).length) {
      pipeline.push({ $match: keywordMatch });
    }
  }

  pipeline.push({ $sort: { createdAt: -1 } });

  // Apply pagination + counts using $facet
  pipeline.push({
    $facet: {
      data: [{ $skip: skip }, ...(limit === 0 ? [] : [{ $limit: limit }])],
      totalFiltered: [{ $count: "count" }],
    },
  });
  const result = await Reservations.aggregate(pipeline);

  let reservations = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Additional counts for meta (active/inactive/total by userId as creator)
  const [total, active, inactive] = await Promise.all([
    Reservations.countDocuments({
      ...(userId && { userId: userId }),
      status: { $ne: "deleted" },
    }),
    Reservations.countDocuments({
      status: "active",
      ...(userId && { userId: userId }),
    }),
    Reservations.countDocuments({
      status: "inactive",
      ...(userId && { userId: userId }),
    }),
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.reservationsCount = { total, active, inactive };

  reservations = reservations.map((item) => {
    const formatted = reservationsFormatter(item, timezone);
    // if (formatted.conditionType == "noCondition" || formatted.conditionType == "ticketRequirement" || formatted.conditionType == "customText" || formatted.conditionType == "ticketRequirement") {
    //   delete formatted.amount;
    //   if (formatted.conditionType == "noCondition") {
    //     delete formatted.ticketType;
    //   }
    // }
    // else {
    //   delete formatted.ticketType;
    // }
    return formatted;
  });
  return { reservations, meta };
};

const getCalendarReservations = async ({
  timezone,
  companyOrganizer,
  organization,
  date,
}) => {
  const pipeline = [];

  // -----------------------------
  // 1️⃣ BASE MATCH
  // -----------------------------
  const match = {
    status: { $ne: "deleted" },
  };

  if (companyOrganizer) {
    match.companyOrganizer = new mongoose.Types.ObjectId(companyOrganizer);
  }

  if (organization) {
    match.organizationId = new mongoose.Types.ObjectId(organization);
  }

  pipeline.push({ $match: match });

  // -----------------------------
  // 3️⃣ JOIN RESERVATION DEFINITION
  // -----------------------------
  pipeline.push(
    {
      $lookup: {
        from: "reservations",
        localField: "reservationId",
        foreignField: "_id",
        pipeline: [
          {
            $project: {
              reservationType: 1,
              conditionType: 1,
              ticketType: 1,
              amount: 1,
            },
          },
        ],
        as: "reservation",
      },
    },
    {
      $unwind: {
        path: "$reservation",
        preserveNullAndEmptyArrays: true,
      },
    },
  );

  // -----------------------------
  // 4️⃣ JOIN EVENT (ObjectId ref)
  // -----------------------------
  pipeline.push(
    {
      $lookup: {
        from: "events",
        localField: "optionalEventId",
        foreignField: "_id",
        as: "event",
      },
    },
    {
      $unwind: {
        path: "$event",
        preserveNullAndEmptyArrays: true,
      },
    },
  );

  // -----------------------------
  // 5️⃣ DATE FILTER (calendar day)
  // -----------------------------
  if (date) {
    const dateObj = new Date(date);
    const { start, end } = getStartAndEndOfDay(dateObj, timezone);

    pipeline.push({
      $match: {
        "timingSlots.dateTimeSlots": {
          $elemMatch: {
            date: { $gte: start, $lt: end },
          },
        },
      },
    });
  }

  // -----------------------------
  // 6️⃣ FINAL PROJECTION
  // -----------------------------
  pipeline.push({
    $project: {
      _id: 1,
      userId: 1,

      user: {
        _id: "$userId",
        firstName: "$firstName",
        lastName: "$lastName",
        phoneNumber: "$phoneNumber",
      },

      partySize: 1,
      organizationId: 1,
      companyOrganizer: 1,
      reservationId: 1,
      reservation: 1,
      timingSlots: 1,
      status: 1,
      optionalEventId: 1,
      createdAt: 1,
      updatedAt: 1,
      notes: 1,
      member: "Gold",

      eventTitle: {
        $ifNull: ["$event.basicInfo.title", "No Event Title"],
      },
    },
  });

  // -----------------------------
  // 7️⃣ SORT
  // -----------------------------
  pipeline.push({ $sort: { createdAt: -1 } });

  // -----------------------------

  // 8️⃣ EXECUTE
  // -----------------------------
  const reservationsResponse = await UserReservations.aggregate(pipeline);

  return {
    reservations: reservationsResponse
      .map((item) => reservationsFormatter(item, timezone))
      .filter(Boolean),
  };
};

const findUserReservationsByIds = async (ids) => {
  return UserReservations.find({
    _id: { $in: ids },
    status: { $ne: "deleted" },
  }).lean();
};

const insertUserReservations = async (docs) => {
  if (!docs.length) return [];
  return UserReservations.insertMany(docs);
};

const insertSingleUserReservation = async (doc) => {
  const created = await UserReservations.create(doc);
  return created;
};

const insertManyUserReservations = async (docs) => {
  const created = await UserReservations.insertMany(docs);
  return created;
};

const bulkUpdateUserReservations = async (bulkOps) => {
  return UserReservations.bulkWrite(bulkOps);
};
const getReservationTypeId = async (reservationType) => {
  if (!reservationType) return null;

  const reservation = await Reservations.findOne(
    {
      reservationType: {
        $regex: new RegExp(`^${reservationType.trim()}$`, "i"),
      },
      status: "active",
    },
    { _id: 1 },
  ).lean();

  return reservation?._id || null;
};

const getReservationTypeCapacityStats = async (query) => {
  const pipeline = [
    { $match: query },
    {
      $group: {
        _id: "$reservationType",
        bookedCapacity: { $sum: "$partySize" },
      },
    },
    {
      $lookup: {
        from: "reservationtypes",
        let: { reservationTypeId: { $toObjectId: "$_id" } },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$reservationTypeId"] } } },
          { $project: { name: 1, maxCapacity: 1 } },
        ],
        as: "reservationTypeDetails",
      },
    },
    {
      $unwind: {
        path: "$reservationTypeDetails",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $project: {
        _id: 1,
        reservationTypeName: {
          $ifNull: ["$reservationTypeDetails.name", "Unknown"],
        },
        maxCapacity: { $ifNull: ["$reservationTypeDetails.maxCapacity", 0] },
        bookedCapacity: 1,
      },
    },
  ];

  return UserReservations.aggregate(pipeline);
};
const getReservationsV2 = async ({
  page,
  limit,
  status,
  companyOrganizer,
  organizationsId,
  date,
  skip,
  reservationType,
  startTime,
  endTime,
}) => {

  const summaryQuery = {
    ...(companyOrganizer && {
      companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
    }),
    ...(organizationsId && {
      organizationId: new mongoose.Types.ObjectId(organizationsId),
    }),
  };
  const query = {
    ...(status && { status }),
    ...(companyOrganizer && {
      companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
    }),
    ...(organizationsId && {
      organizationId: new mongoose.Types.ObjectId(organizationsId),
    }),
    ...(reservationType && {
      reservationType: new mongoose.Types.ObjectId(reservationType),
    }),
  };
  const dateTimeElemMatch = {};

  if (startTime) {
    // Each timeSlot's startTime/endTime is stored as a full UTC datetime
    // (day + time) on the dateTimeSlots entry. `startTime` here already
    // carries the correct day/timezone, and `endTime` is startTime + 1h.
    // Match any slot that OVERLAPS the [start, end) window, i.e.
    // slot.startTime < end AND slot.endTime > start.
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : null;

    dateTimeElemMatch.timeSlots = {
      $elemMatch: end
        ? { startTime: { $lt: end }, endTime: { $gt: start } }
        : { endTime: { $gt: start } },
    };
  } else if (date) {
    const start = new Date(date);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 1);

    dateTimeElemMatch.date = { $gte: start, $lt: end };
  }

  if (Object.keys(dateTimeElemMatch).length) {
    query["timingSlots.dateTimeSlots"] = { $elemMatch: dateTimeElemMatch };
    summaryQuery["timingSlots.dateTimeSlots"] = {
      $elemMatch: dateTimeElemMatch,
    };
  }

  const pipeline = [
    { $match: query },
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    ...(limit === 0 ? [] : [{ $limit: limit }]),
    {
      $lookup: {
        from: "occasions", // adjust to actual Occasion collection name
        let: {
          occasionId: {
            $convert: {
              input: "$occasion",
              to: "objectId",
              onError: null,
              onNull: null,
            },
          },
        },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$occasionId"] } } },
          { $project: { name: 1 } },
        ],
        as: "occasionDetails",
      },
    },
    {
      $addFields: {
        occasion: { $first: "$occasionDetails" },
      },
    },
    {
      $lookup: {
        from: "reservationtypes", // adjust to actual Reservation collection name
        let: {
          reservationType: {
            $convert: {
              input: "$reservationType",
              to: "objectId",
              onError: null,
              onNull: null,
            },
          },
        },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$reservationType"] } } },
          { $project: { name: 1 } },
        ],
        as: "reservationType",
      },
    },
    {
      $addFields: {
        reservationType: { $first: "$reservationType" },
      },
    },
    {
      $lookup: {
        from: "organizations", // adjust to actual Organization collection name
        let: {
          organizationId: {
            $convert: {
              input: "$organizationId",
              to: "objectId",
              onError: null,
              onNull: null,
            },
          },
        },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$organizationId"] } } },
          { $project: { "basicInfo.name": 1 } },
        ],
        as: "organizationId",
      },
    },
    {
      $addFields: {
        organizationId: { $first: "$organizationId" },
      },
    },
    { $project: { occasionDetails: 0, organizationDetails: 0 } },
  ];

  const [reservations, reservationTypeCapacityStats, totalFiltered] =
    await Promise.all([
      UserReservations.aggregate(pipeline),
      getReservationTypeCapacityStats(summaryQuery),
      UserReservations.countDocuments(query),
    ]);

  let meta = generateMeta(page, limit, totalFiltered);
  meta.reservationTypeCapacityStats = reservationTypeCapacityStats;

  return { reservations, meta };
};
const getReservationsV2Calender = async ({
  companyOrganizer,
  organization,
  start,
  end,
}) => {
  const pipeline = [
    {
      $match: {
        status: { $ne: "deleted" },
        ...(companyOrganizer && {
          companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
        }),
        ...(organization && {
          organizationId: new mongoose.Types.ObjectId(organization),
        }),
      },
    },
    { $unwind: "$timingSlots.dateTimeSlots" },
    {
      $match: {
        "timingSlots.dateTimeSlots.date": { $gte: start, $lt: end },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$timingSlots.dateTimeSlots.date",
          },
        },
        totalReservations: { $sum: 1 },
        timeSlots: {
          $push: {
            reservationId: "$_id",
            bookingId: "$bookingId",
            firstName: "$firstName",
            lastName: "$lastName",
            partySize: "$partySize",
            status: "$status",
            timeSlots: "$timingSlots.dateTimeSlots.timeSlots",
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        date: "$_id",
        totalReservations: 1,
        timeSlots: 1,
      },
    },
    { $sort: { date: 1 } },
  ];
  
const pipelineMaxCapacity = [
  {
    $match: {
      status: "active",

      ...(companyOrganizer && {
        companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
      }),

      ...(organization && {
        organization: new mongoose.Types.ObjectId(organization),
      }),
    },
  },

  {
    $group: {
      _id: null,
      totalMaxCapacity: {
        $sum: "$maxCapacity",
      },
    },
  },

  {
    $project: {
      _id: 0,
      totalMaxCapacity: 1,
    },
  },
];
  const [reservations, maxCapacityResult] = await Promise.all([
    UserReservations.aggregate(pipeline),
    ReservationType.aggregate(pipelineMaxCapacity),
  ]);
  
  const totalMaxCapacity = maxCapacityResult[0]?.totalMaxCapacity || 0;
  const meta = {
    totalMaxCapacity,
  };
  return { reservations, meta };
};
const getLatestUserReservations = async (userId, organizationId, limit = 5) => {
  const reservations = await UserReservations.find({
    userId,
    organizationId,
  })
    .select("reservationType amount timingSlots firstName lastName phoneNumber notes status voucher")
    .populate("reservationType")
    .sort({ createdAt: -1 })
    .limit(limit);

  return reservations;
};

const validateReservationForOrder = async ({
  reservationId,
  userId,
  timezone,
  session,
}) => {
  if (!reservationId) {
    return null;
  }

  if (!mongoose.Types.ObjectId.isValid(reservationId)) {
    throw new Error("Invalid reservationId");
  }

  if (!timezone || !moment.tz.zone(timezone)) {
    throw new Error("Invalid timezone");
  }

  const reservation = await UserReservations.findOne({
    _id: reservationId,
    // userId,
    status: {
      $in: ["confirmed", "checkedIn"],
    },
  }).session(session);

  if (!reservation) {
    throw new Error("Reservation not found or does not belong to this user");
  }

  const now = moment.tz(timezone);

  const isReservationToday = reservation.timingSlots?.dateTimeSlots?.some(
    (dateSlot) => {
      if (!dateSlot.date) {
        return false;
      }

      const reservationDate = moment.tz(dateSlot.date, timezone);

      return reservationDate.isSame(now, "day");
    },
  );

  if (!isReservationToday) {
    throw new Error(
      "Reservation voucher can only be used on the reservation day",
    );
  }

  return reservation;
};

const consumeReservationVoucher = async ({
  reservation,
  orderAmount,
  session,
}) => {
  const amount = Number(orderAmount) || 0;
  const voucher = reservation?.voucher;

  if (!reservation || amount <= 0 || voucher?.status !== "pending") {
    return {
      voucherAmount: 0,
      orderAmountDue: Math.max(amount, 0),
      remainingBalance: Math.max(
        Number(voucher?.discountAmount || 0) - Number(voucher?.usedAmount || 0),
        0,
      ),
    };
  }

  const total = Number(voucher.discountAmount) || 0;
  const used = Number(voucher.usedAmount) || 0;
  const remaining = Math.max(total - used, 0);

  const voucherAmount = Math.min(amount, remaining);
  const newUsed = used + voucherAmount;
  const newRemaining = Math.max(total - newUsed, 0);

  const updated = await UserReservations.findOneAndUpdate(
    {
      _id: reservation._id,
      "voucher.status": "pending",
      "voucher.usedAmount": used,
    },
    {
      $inc: { "voucher.usedAmount": voucherAmount },
      $set: {
        "voucher.status": newRemaining === 0 ? "applied" : "pending",
      },
    },
    { session },
  );

  if (!updated) {
    throw new Error("Voucher balance changed. Please try again.");
  }

  return {
    voucherAmount,
    orderAmountDue: amount - voucherAmount,
    remainingBalance: newRemaining,
  };
};





// --- diff helpers -----------------------------------------------------------
// --- shared timing helpers --------------------------------------------------

const DAY_START = 0;
const DAY_END = 24 * 60; // 1440

const HHMM = /^(\d{1,2}):(\d{2})$/;

// "13:00" | ISODate | ISO string  ->  minutes from UTC midnight
const toMinutes = (value) => {
  if (value == null) return null;

  if (typeof value === "string") {
    const match = value.match(HHMM);
    if (match) return Number(match[1]) * 60 + Number(match[2]);
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getUTCHours() * 60 + date.getUTCMinutes();
};

// "2026-09-10" | ISODate  ->  "2026-09-10"
const toDateKey = (value) => {
  if (typeof value === "string") return value.slice(0, 10);

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

// A date block -> [{ start, end }]. No usable slots means the whole day.
const toRanges = (timeSlots = [], isWholeDay = false) => {
  const ranges = isWholeDay
    ? []
    : (timeSlots || [])
        .map((s) => ({ start: toMinutes(s?.startTime), end: toMinutes(s?.endTime) }))
        .filter((r) => r.start !== null && r.end !== null && r.end > r.start);

  return ranges.length ? ranges : [{ start: DAY_START, end: DAY_END }];
};

const overlaps = (a, b) => a.start < b.end && b.start < a.end;

const sumBy = (list, key) => list.reduce((total, item) => total + (item[key] || 0), 0);
const num = (value) => (value == null ? 0 : Number(value));
const slotsFingerprint = (timingSlots) => {
  if (!Array.isArray(timingSlots) || timingSlots.length === 0) {
    return "";
  }

  return timingSlots
    .map((slot) => {
      const start = slot?.startTime
        ? new Date(slot.startTime).getTime()
        : "";

      const end = slot?.endTime
        ? new Date(slot.endTime).getTime()
        : "";

      return `${start}-${end}`;
    })
    .sort()
    .join("|");
};


const datesOf = (timingSlots) => {
  if (!timingSlots?.dateTimeSlots?.length) return new Set();
  return new Set(timingSlots.dateTimeSlots.map((slot) => toDateKey(slot.date)));
};

// --- update checker ---------------------------------------------------------

const checkReservationAvailabilityForUpdate = async ({
  reservationId,
  organizationId: organization,
  payload, // the complete reservation object coming from the client
}) => {
  const existing = await UserReservations.findOne({
    _id: reservationId,
    organizationId: new mongoose.Types.ObjectId(organization),
  })
    .select("timingSlots numberOfTables partySize bookingDuration reservationType status")
    .lean();

  if (!existing) {
    return { allowed: false, message: "Reservation not found" };
  }

  if (["cancelled", "completed", "noShow"].includes(existing.status)) {
    return { allowed: false, message: `A ${existing.status} reservation cannot be updated` };
  }

  const next = {
    reservationTypeId: payload.reservationTypeId ?? payload.reservationType,
    partySize: num(payload.partySize),
    numberOfTables: num(payload.numberOfTables),
    timingSlots: payload.timingSlots,
  };

  const prev = {
    reservationTypeId: existing.reservationType,
    partySize: num(existing.partySize),
    numberOfTables: num(existing.numberOfTables),
    timingSlots: existing.timingSlots,
  };

  // 1. Work out what actually changed
  const changes = {
    reservationType: String(next.reservationTypeId) !== String(prev.reservationTypeId),
    partySize: next.partySize !== prev.partySize,
    numberOfTables: next.numberOfTables !== prev.numberOfTables,
    timing:
      slotsFingerprint(next.timingSlots) !== slotsFingerprint(prev.timingSlots),
  };

  const changedFields = Object.keys(changes).filter((key) => changes[key]);

  console.log("changedFields",changedFields);

  // 2. Nothing capacity-relevant changed — the client just resent the same data
  if (!changedFields.length) {
    return { allowed: true, message: "No capacity-relevant changes", changes: [] };
  }

  // 3. Same slots + same type + only shrinking → always safe, no query needed
  const onlyShrinking =
    !changes.timing &&
    !changes.reservationType &&
    next.partySize <= prev.partySize &&
    next.numberOfTables <= prev.numberOfTables;

  if (onlyShrinking) {
    return { allowed: true, message: "Reservation is available", changes: changedFields };
  }

  // 4. Basic shape validation before hitting the DB
  if (!next.timingSlots?.dateTimeSlots?.length) {
    return { allowed: false, message: "At least one date is required", changes: changedFields };
  }

  // 5. Full check against everyone else's bookings, excluding this reservation
  const { checkReservationAvailability } = require("../../app/reservations/reservationRepository");
  console.log("reservationId",reservationId);
  const result = await checkReservationAvailability({
    reservationTypeId: new mongoose.Types.ObjectId(next.reservationTypeId),
    partySize: next.partySize,
    numberOfTables: next.numberOfTables,
    organization: new mongoose.Types.ObjectId(organization),
    timingSlots: next.timingSlots,
    excludeReservationId: reservationId,
  });

  // 6. Helpful extras for the client
  const removedDates = [...datesOf(prev.timingSlots)].filter((d) => !datesOf(next.timingSlots).has(d));
  const addedDates = [...datesOf(next.timingSlots)].filter((d) => !datesOf(prev.timingSlots).has(d));

  return {
    ...result,
    changes: changedFields,
    ...(removedDates.length && { removedDates }),
    ...(addedDates.length && { addedDates }),
  };
};


module.exports = {
  findUserReservationById,
  insertSingleUserReservation,
  findUserReservationsByIds,
  insertUserReservations,
  createReservation,
  getReservationsWithFilters,
  countReservations,
  findReservationById,
  updateReservationData,
  deleteReservationById,
  findByIdAndUpdate,
  getReservations,
  getUserReservations,
  findUserById,
  getavailableReservations,
  getCalendarReservations,
  findUserReservationsByIdsLean,
  insertManyUserReservations,
  bulkUpdateUserReservations,
  getReservationTypeId,
  getReservationsV2,
  getReservationsV2Calender,
  getLatestUserReservations,
  validateReservationForOrder,
  consumeReservationVoucher,
  checkReservationAvailabilityForUpdate
};
