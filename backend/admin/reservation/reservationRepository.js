// repositories/ReservationRepository.js
const Reservations = require("@ReservationsModel");
const { UserReservations } = require("@UserReservationsModel");
const { User } = require("../../models/UserModel");
const Event = require("@EventsModel");
const mongoose = require("mongoose");
const { reservationsFormatter, reservationsFormatterAdjustDates } = require("../../app/reservations/formaters/reservationFormetter");
const Organizations = require("@OrganizationModel")
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
const { userReservationFormatterAdjustDates } = require("./formatters/userReservationFormatterAdjustDates");
const { attachUserLevelsToReservations, buildClubMemberMap } = require("./utils/attachUserLevelsToReservations");
const { getClubMembersForUsers } = require("../../app/loyalty/clubMembers/clubMembersRepository");
const { getActiveTiersWithProjection } = require("../tiers/tiersRepository");
const getCreatorFromOrganization = async (organizationId) => {
  try {
    const result = await Organizations.aggregate([
      {
        $match: { _id: new mongoose.Types.ObjectId(organizationId) },  // Match the organization by its ID
      },
      {
        $lookup: {
          from: "users",  // Assuming the 'creator' is in the 'users' collection
          localField: "creator",  // Field in the 'organizations' collection that references the creator
          foreignField: "_id",  // Field in the 'users' collection to match with
          as: "creatorDetails",  // Alias for the resulting array of creator data
        },
      },
      {
        $unwind: { path: "$creatorDetails", preserveNullAndEmptyArrays: true },  // Unwind creator details array (if it exists)
      },
      {
        $project: {
          creatorId: "$creatorDetails._id",  // Extract just the _id of the creator
          _id: 0,  // Exclude the organization _id from the result
        },
      },
    ]);

    if (result.length > 0) {
      return result[0].creatorId;  // Return the creator ID
    } else {
      return null;  // Return null if no matching organization is found
    }
  } catch (err) {

    throw err;
  }
};
const createReservation = async (data) => {
  try {

    data.companyOrganizer = await getCreatorFromOrganization(data.organizationId);
    const Reservation = new Reservations(data);
    await Reservation.save();
    const userIds = (await getAllUsers({ page: 1, limit: 1000000 })).users.map(user => user._id.toString());
    await sendUserNotifications({
      recipientIds: userIds,
      title: `New Reservation Available`,
      body: ` A new reservation has been created. Check it out!`,
      data: { type: NotificationTypes.RESERVATION_UPDATE, reservationId: Reservation._id, objectType: "reservations" },
      sender: Reservation.companyOrganizer,
      objectId: Reservation._id,
      image: null,
    });
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




const getReservations = async ({ timezone, page, limit, keyword, status, userId, organizationsId, date, range, skip }) => {
  const now = getCurrentDateInTimezone({ timezone });


  let organizationsIds = Array.isArray(organizationsId)
    ? organizationsId
    : JSON.parse(organizationsId || '[]');
  organizationsIds = organizationsIds.map(id => new mongoose.Types.ObjectId(id));
  const pipeline = [
    {
      $match: {
        ...(userId && { companyOrganizer: new mongoose.Types.ObjectId(userId) }),
        ...(organizationsIds.length > 0 && { organizationId: { $in: organizationsIds } }) // Match as ObjectId
      }
    }
  ];
  if (range == "monthly") {
    const { start, end } = getStartAndEndOfMonth(now, timezone);

    pipeline.push({
      $match: {
        "timingSlots.dateTimeSlots": {
          $elemMatch: {
            date: { $gte: start, $lt: end }
          }
        }
      }
    });
  }
  if (range == "weekly") {
    const { start, end } = getStartAndEndOfWeek(now, timezone);

    pipeline.push({
      $match: {
        "timingSlots.dateTimeSlots": {
          $elemMatch: {
            date: { $gte: start, $lt: end }
          }
        }
      }
    });
  }
  if (range == "today") {
    const { start, end } = getStartAndEndOfDay(now, timezone);
    pipeline.push({
      $match: {
        "timingSlots.dateTimeSlots": {
          $elemMatch: {
            date: { $gte: start, $lt: end }
          }
        }
      }
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
            date: { $gte: start, $lt: end }
          }
        }
      }
    });
  }

  if (keyword) {
    const keywordMatch = buildKeywordQueryFromModels(
      [
        { schema: Reservations.schema }
      ],
      keyword
    );

    if (Object.keys(keywordMatch).length) {
      pipeline.push({ $match: keywordMatch });
    }
  }

  pipeline.push({ $sort: { createdAt: -1 } });

  // Apply pagination + counts using $facet
  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        ...(limit === 0 ? [] : [{ $limit: limit }])
      ],
      totalFiltered: [{ $count: "count" }]
    }
  });
  const result = await Reservations.aggregate(pipeline);


  let reservations = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Additional counts for meta (active/inactive/total by userId as creator)
  const [total, active, inactive] = await Promise.all([
    Reservations.countDocuments({ ...(userId && { userId: userId }), status: { $ne: "deleted" } }),
    Reservations.countDocuments({ status: "active", ...(userId && { userId: userId }) }),
    Reservations.countDocuments({ status: "inactive", ...(userId && { userId: userId }) })
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.reservationsCount = { total, active, inactive };


  reservations = reservations.map(item => {
    const formatted = reservationsFormatter(item);
    if (formatted.conditionType == "noCondition" || formatted.conditionType == "ticketRequirement" || formatted.conditionType == "customText" || formatted.conditionType == "ticketRequirement") {
      delete formatted.amount;
      if (formatted.conditionType == "noCondition") {
        delete formatted.ticketType;
      }
    }
    else {
      delete formatted.ticketType;
    }
    return formatted;
  });
  return { reservations, meta }
}


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
  reservationId
}) => {
  const now = getCurrentDateInTimezone({ timezone });

  const pipeline = [];

  // -----------------------------
  // 1️⃣ BASE MATCH (UserReservations)
  // -----------------------------
  const match = {};

  if (status) {
    match.status = status;
  } else {
    match.status = { $ne: "deleted" };
  }

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
        as: "reservation"
      }
    },
    {
      $unwind: {
        path: "$reservation",
        preserveNullAndEmptyArrays: true
      }
    }
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
              $expr: { $eq: ["$_id", "$$eventId"] }
            }
          },
          {
            $project: {
              _id: 1,
              "basicInfo.title": 1
            }
          }
        ],
        as: "event"
      }
    },
    {
      $unwind: {
        path: "$event",
        preserveNullAndEmptyArrays: true
      }
    }
  );


  // -----------------------------
  // 4️⃣ DATE RANGE FILTERS (Slots)
  // -----------------------------
  if (range === "monthly") {
    const { start, end } = getStartAndEndOfMonth(now, timezone);
    pipeline.push({
      $match: {
        "timingSlots.dateTimeSlots": {
          $elemMatch: { date: { $gte: start, $lt: end } }
        }
      }
    });
  }

  if (range === "weekly") {
    const { start, end } = getStartAndEndOfWeek(now, timezone);
    pipeline.push({
      $match: {
        "timingSlots.dateTimeSlots": {
          $elemMatch: { date: { $gte: start, $lt: end } }
        }
      }
    });
  }

  if (range === "today") {
    const { start, end } = getStartAndEndOfDay(now, timezone);
    pipeline.push({
      $match: {
        "timingSlots.dateTimeSlots": {
          $elemMatch: { date: { $gte: start, $lt: end } }
        }
      }
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
        createdAt: { $gte: start, $lt: end }
      }
    });
  }

  // -----------------------------
  // 6️⃣ KEYWORD SEARCH
  // -----------------------------
  if (keyword) {
    const keywordMatch = buildKeywordQueryFromModels(
      [{ schema: UserReservations.schema }],
      keyword
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
      data: [
        { $skip: skip },
        ...(limit === 0 ? [] : [{ $limit: limit }])
      ],
      totalFiltered: [{ $count: "count" }]
    }
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
    ...new Set(userReservations.map(r => r.userId.toString()))
  ].map(id => new mongoose.Types.ObjectId(id));

  const companyOrganizers = [
    ...new Set(userReservations.map(r => r.companyOrganizer.toString()))
  ].map(id => new mongoose.Types.ObjectId(id));

  // -----------------------------
  // FETCH ONCE (BULK)
  // -----------------------------
  const [members, activeTiers] = await Promise.all([
    getClubMembersForUsers({ userIds, companyOrganizers }),
    getActiveTiersWithProjection({ _id: 1, title: 1 })
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
    tierIdToTitle
  });

  // -----------------------------
  // FORMAT + RETURN
  // -----------------------------
  return {
    reservations: enrichedReservations.map(item =>
      userReservationFormatterAdjustDates(item, timezone)
    ),
    meta
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





const getavailableReservations = async ({ timezone, page, limit, keyword, status, userId, organizationsId, date, range, skip }) => {
  // let now = getCurrentDateInTimezone({ timezone });
  //  date = convertTimezoneToUtcDateOnly(
  //   now,
  //   timezone
  // );

  const now = getCurrentUtcDateOnly();


  let organizationObjectId = null;

  if (
    organizationsId &&
    organizationsId !== "undefined" &&
    organizationsId !== "null"
  ) {
    organizationObjectId = new mongoose.Types.ObjectId(organizationsId);
  }
  console.log("organizationObjectId:", organizationObjectId);
  console.log("userId:", userId);
  const pipeline = [
    {
      $match: {
        ...(userId && { companyOrganizer: new mongoose.Types.ObjectId(userId) }),
        ...(organizationObjectId && { organizationId: organizationObjectId }),
      },
    },
  ];

  if (range == "monthly") {


    // Update the pipeline to match events within the specified date range
    pipeline.push({
      $match: {
        "timingSlots.dateTimeSlots": {
          $elemMatch: {
            date: { $gte: start, $lt: adjustedEnd }
          }
        }
      }
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
            date: { $gte: start, $lt: adjustedEnd }
          }
        }
      }
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
            date: { $gte: start, $lt: adjustedEnd }
          }
        }
      }
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
                      { $lt: ["$$slot.date", end] } // Match slot date < end date
                    ]
                  }
                }
              }
            },
            0
          ]
        }
      }
    });

    // Log the pipeline for debugging

  }

  if (keyword) {
    const keywordMatch = buildKeywordQueryFromModels(
      [
        { schema: Reservations.schema }
      ],
      keyword
    );

    if (Object.keys(keywordMatch).length) {
      pipeline.push({ $match: keywordMatch });
    }
  }

  pipeline.push({ $sort: { createdAt: -1 } });

  // Apply pagination + counts using $facet
  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        ...(limit === 0 ? [] : [{ $limit: limit }])
      ],
      totalFiltered: [{ $count: "count" }]
    }
  });
  const result = await Reservations.aggregate(pipeline);


  let reservations = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Additional counts for meta (active/inactive/total by userId as creator)
  const [total, active, inactive] = await Promise.all([
    Reservations.countDocuments({ ...(userId && { userId: userId }), status: { $ne: "deleted" } }),
    Reservations.countDocuments({ status: "active", ...(userId && { userId: userId }) }),
    Reservations.countDocuments({ status: "inactive", ...(userId && { userId: userId }) })
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.reservationsCount = { total, active, inactive };


  reservations = reservations.map(item => {
    const formatted = reservationsFormatter(item);
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
  return { reservations, meta }
}


const getCalendarReservations = async ({
  timezone,
  companyOrganizer,
  organization,
  date
}) => {
  const pipeline = [];

  // -----------------------------
  // 1️⃣ BASE MATCH
  // -----------------------------
  const match = {
    status: { $ne: "deleted" }
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
              amount: 1
            }
          }
        ],
        as: "reservation"
      }
    },
    {
      $unwind: {
        path: "$reservation",
        preserveNullAndEmptyArrays: true
      }
    }
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
        as: "event"
      }
    },
    {
      $unwind: {
        path: "$event",
        preserveNullAndEmptyArrays: true
      }
    }
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
            date: { $gte: start, $lt: end }
          }
        }
      }
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
        phoneNumber: "$phoneNumber"
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
        $ifNull: ["$event.basicInfo.title", "No Event Title"]
      }
    }
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
    reservations: reservationsResponse.map(item => reservationsFormatter(item, timezone))
      .filter(Boolean)
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
        $regex: new RegExp(`^${reservationType.trim()}$`, "i")
      },
      status: "active"
    },
    { _id: 1 }
  ).lean();

  return reservation?._id || null;
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
  getReservationTypeId
};