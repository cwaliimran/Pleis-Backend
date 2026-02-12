// repositories/ReservationRepository.js
const Reservations = require("@ReservationsModel");
const { UserReservations } = require("@UserReservationsModel");
const { User } = require("@UserModel");
const mongoose = require("mongoose");
const { reservationsFormatter } = require("./formaters/reservationFormetter");
const Organizations = require("@OrganizationModel");
const { getUserInterestsIdsForRecommendation } =
  require("../usersManagement/usersRepository");



const {
  generateMeta,
  convertToUtcDateOnly,
  getCurrentDateInTimezone,
  getStartAndEndOfDay,
  convertTimezoneToUtc,
  getStartAndEndOfMonth,
} = require("../../helperUtils/responseUtil");
const { placePreOrderMenuItemsWithReservation } = require("../menuItemsAndOrdering/orders/orderService");
const { sendUserNotifications } = require("../../controllers/communicationController");
const { NotificationTypes } = require("@NotificationsModel");
const { getStaffIdsByOrganization } = require("../../admin/organizations/organizationRepository");
const createReservation = async (data, session) => {
  if (!session) throw new Error("session_required");

  const {
    userId,
    reservationId,
    partySize,
    preOrderMenuItems,
    timezone,
    firstName,
    lastName,
    phoneNumber,
  } = data;

  const TAX_RATE = 0.06;

  /* ---------- Capacity check ---------- */
  const capacityCheck = await validateReservationCapacity({
    reservationId,
    session,
  });

  if (!capacityCheck.valid) {
    return { success: false, error: capacityCheck.error };
  }
  let userData;
  if (userId) {
    userData = await User.findById(
      userId,
      "firstName lastName phoneNumber",
      { session }
    ).lean();

    if (!userData) throw new Error("User not found");
  } else {
    userData = { firstName, lastName, phoneNumber };
  }

  data.firstName = userData.firstName || "";
  data.lastName = userData.lastName || "";
  data.phoneNumber = userData.phoneNumber || "";


  /* ---------- Reservation base ---------- */
  const reservationBase = await Reservations
    .findById(reservationId)
    .session(session)
    .lean();

  if (!reservationBase)
    throw new Error("Reservation not found");

  data.reservationSnapshot = reservationBase;

  const baseAmount = Number(reservationBase.amount ?? 0);

  /* ---------- Pricing ---------- */
  let totalReservationAmount = 0;

  switch (reservationBase.conditionType) {
    case "fixedPrice":
      totalReservationAmount =
        baseAmount * Number(partySize || 1);
      break;

    case "prepayOption":
    case "minimumSpendOnLocation":
      totalReservationAmount = baseAmount;
      break;

    case "noCondition":
    case "customText":
    default:
      totalReservationAmount = 0;
  }

  /* ---------- Reservation tax ---------- */
  let reservationTax = 0;

  if (totalReservationAmount > 0) {
    reservationTax =
      totalReservationAmount * TAX_RATE;
  }

  const reservationTotalWithTax =
    totalReservationAmount + reservationTax;

  data.amount = reservationTotalWithTax;

  /* ---------- Confirmation flow ---------- */
  if (reservationBase.needsConfirmation) {
    data.status = "needsConfirmation";
  } else {
    if (
      reservationTotalWithTax > 0 &&
      ["card", "applePay"].includes(
        data?.paymentDetails?.paymentMethod
      )
    ) {
      data.lockUntil = new Date(
        Date.now() + 10 * 60 * 1000
      );
      data.status = "pendingPayment";
    } else {
      //throw error payment method is required
      throw new Error("Payment method is required");
    }
  }

  /* ---------- Save reservation ---------- */
  const userReservation = new UserReservations(data);
  await userReservation.save({ session });

  /* ---------- Preorder handling ---------- */
  if (preOrderMenuItems?.items?.length) {
    const order =
      await placePreOrderMenuItemsWithReservation({
        userId,
        timezone,
        items: preOrderMenuItems.items,
        notes: preOrderMenuItems.notes,
        reservation: userReservation._id,
        paymentDetails: data?.paymentDetails,
        session,
      });

    const totalPrice =
      reservationTotalWithTax + order.totalPrice;

    userReservation.preOrderMenuItemsOrder =
      order._id;

    userReservation.amount = totalPrice;

    userReservation.priceBreakDown = {
      reservationAmount: totalReservationAmount,
      reservationTax,
      preOrderMenuItemsAmount: order.totalPrice,
    };

    await userReservation.save({ session });
  }

  /* ---------- Notifications ---------- */
  if (userReservation.userId) {
    await sendUserNotifications({
      recipientIds: [userReservation.userId.toString()],
      title: "Reservation Created",
      body: `Your reservation has been created successfully.`,
      data: {
        type: NotificationTypes.RESERVATION_UPDATE,
        objectType: "userreservations",
      },
      image: "noimage",
      sender: userId,
      objectId: userReservation.reservationId,
    });
  }

  const staffIds =
    await getStaffIdsByOrganization(
      userReservation.organizationId
    );

  await sendUserNotifications({
    recipientIds: staffIds,
    title: "A New Reservation Created",
    body: `A new reservation has been created successfully.`,
    data: {
      type: NotificationTypes.RESERVATION_UPDATE,
      objectType: "userreservations",
    },
    image: "noimage",
    sender: userId,
    objectId: userReservation.reservationId,
  });

  return {
    success: true,
    reservation: userReservation,
  };
};



const validateReservationCapacity = async ({
  reservationId
}) => {
  const now = new Date();
  const reservationObjectId = new mongoose.Types.ObjectId(reservationId);

  // 1️⃣ Fetch reservation definition
  const reservation = await Reservations.findById(reservationObjectId)
    .select("availableReservations");

  if (!reservation) {
    return { valid: false, error: "reservation_not_found" };
  }

  // 2️⃣ Count BLOCKED reservations
  const bookedAgg = await UserReservations.aggregate([
    {
      $match: {
        reservationId: reservationObjectId
      }
    },
    {
      $match: {
        $or: [
          { status: { $in: ["confirmed", "checkedIn", "completed"] } },
          {
            status: "pendingPayment",
            lockUntil: { $gt: now }
          }
        ]
      }
    },
    {
      $count: "count"
    }
  ]);

  const used = bookedAgg[0]?.count || 0;
  const remaining = reservation.availableReservations - used;

  if (remaining <= 0) {
    return {
      valid: false,
      error: "reservation_capacity_exceeded",
      available: 0
    };
  }

  return {
    valid: true,
    available: remaining
  };
};




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

  return UserReservations.find({ userId: id });
};
const findUserReservationById = async (id) => {

  return UserReservations.findById(id);
};

// Update and save
const updateReservationData = async (Reservation, data) => {
  Object.assign(Reservation, data);
  return await Reservation.save();
};

// Delete
const deleteReservationById = async (Reservation) => {
  return await UserReservations.deleteOne();
};

//findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  return UserReservations.findByIdAndUpdate(id, data, { new: true });
};

const getReservations = async ({
  timezone,
  page = 1,
  limit = 10,
  keyword,
  status,
  userId,
  eventId,
  organizationId,
  date,
  availability
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  // ✅ Always UTC for comparisons
  const now = new Date();

  const pipeline = [];

  /* --------------------------------
     1️⃣ BASE MATCH
  -------------------------------- */
  const match = {};
  if (eventId) match.optionalEventId = new mongoose.Types.ObjectId(eventId);
  if (organizationId) match.organizationId = new mongoose.Types.ObjectId(organizationId);

  pipeline.push({ $match: match });

  /* --------------------------------
     2️⃣ STATUS
  -------------------------------- */
  pipeline.push({ $match: { status: "active" } });

  /* --------------------------------
     3️⃣ SLOT FILTER (UNWIND → FILTER)
  -------------------------------- */
  const slotExpr = [
    {
      $gt: [
        "$timingSlots.dateTimeSlots.timeSlots.endTime",
        "$timingSlots.dateTimeSlots.timeSlots.startTime"
      ]
    },
    {
      $gt: [
        "$timingSlots.dateTimeSlots.timeSlots.endTime",
        now
      ]
    }
  ];

  if (date) {
    let start, end;

    if (availability === "full-month") {
      ({ start, end } = getStartAndEndOfMonth(date, timezone));
    } else {
      ({ start, end } = getStartAndEndOfDay(date, timezone));
    }

    slotExpr.push({
      $and: [
        { $gte: ["$timingSlots.dateTimeSlots.date", start] },
        { $lte: ["$timingSlots.dateTimeSlots.date", end] }
      ]
    });
  }


  pipeline.push(
    { $unwind: "$timingSlots.dateTimeSlots" },
    { $unwind: "$timingSlots.dateTimeSlots.timeSlots" },
    {
      $match: {
        "timingSlots.enabled": true,
        $expr: { $and: slotExpr }
      }
    },

    /* --------------------------------
       4️⃣ REBUILD timeSlots PER DATE
    -------------------------------- */
    {
      $group: {
        _id: {
          reservationId: "$_id",
          dateBlockId: "$timingSlots.dateTimeSlots._id"
        },
        reservation: { $first: "$$ROOT" },
        timeSlots: {
          $push: "$timingSlots.dateTimeSlots.timeSlots"
        }
      }
    },

    /* --------------------------------
       5️⃣ REBUILD dateTimeSlots
    -------------------------------- */
    {
      $addFields: {
        "reservation.timingSlots.dateTimeSlots": [
          {
            _id: "$_id.dateBlockId",
            date: "$reservation.timingSlots.dateTimeSlots.date",
            timeSlots: "$timeSlots"
          }
        ]
      }
    },

    { $replaceRoot: { newRoot: "$reservation" } },

    /* --------------------------------
       6️⃣ FINAL GROUP (ONE DOC)
    -------------------------------- */
    {
      $group: {
        _id: "$_id",
        doc: { $first: "$$ROOT" }
      }
    },
    { $replaceRoot: { newRoot: "$doc" } }
  );

  /* --------------------------------
     7️⃣ CAPACITY ENFORCEMENT
  -------------------------------- */
  pipeline.push(
    {
      $lookup: {
        from: "userreservations",
        let: { reservationId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$reservationId", "$$reservationId"] },
                  {
                    $or: [
                      { $in: ["$status", ["confirmed", "checkedIn", "completed"]] },
                      {
                        $and: [
                          { $eq: ["$status", "pendingPayment"] },
                          { $gt: ["$lockUntil", now] }
                        ]
                      }
                    ]
                  }
                ]
              }
            }
          },
          { $count: "count" }
        ],
        as: "blocked"
      }
    },
    {
      $addFields: {
        remainingReservations: {
          $subtract: [
            "$availableReservations",
            { $ifNull: [{ $first: "$blocked.count" }, 0] }
          ]
        }
      }
    },
    { $match: { remainingReservations: { $gt: 0 } } }
  );

  /* --------------------------------
     8️⃣ SORT + PAGINATION
  -------------------------------- */
  pipeline.push(
    { $sort: { createdAt: -1 } },
    {
      $facet: {
        data: [
          { $skip: skip },
          ...(limit === 0 ? [] : [{ $limit: limit }])
        ],
        totalFiltered: [{ $count: "count" }]
      }
    }
  );

  const result = await Reservations.aggregate(pipeline);

  return {
    reservations: result[0]?.data || [],
    meta: generateMeta(
      page,
      limit,
      result[0]?.totalFiltered[0]?.count || 0
    )
  };
};


const getUserReservations = async ({ timezone, page, limit, userId, date }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  if (date) {
    date = convertToUtcDateOnly(date, "UTC");
  }

  // Querying UserReservations collection directly
  const query = {
    ...(userId && { userId }),  // Match userId if provided
    ...(date && {
      // Convert the passed date string to a Date object and ensure the comparison uses Date objects
      "timingSlots.dateTimeSlots.date": {
        $gte: new Date(date), // Start of the day (using the date provided)
        $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)) // End of the day (next day)
      }
    }),
  };

  const pipeline = [
    // Match by userId
    {
      $match: query,
    },
    // Lookup to fetch user details from users table
    {
      $lookup: {
        from: "users",  // The users collection
        localField: "userId",  // Match userId from UserReservations
        foreignField: "_id",  // Match _id in users collection
        as: "user"  // Store results in "user" field
      }
    },
    {
      $unwind: {
        path: "$user",  // Flatten the user array
        preserveNullAndEmptyArrays: true  // If no user is found, it will be null
      }
    },
    // Lookup to fetch event details using optionalEventId
    {
      $lookup: {
        from: "events",  // The events collection
        localField: "optionalEventId",  // Match optionalEventId from UserReservations
        foreignField: "_id",  // Match _id in events collection
        as: "event"  // Store results in "event" field
      }
    },
    {
      $unwind: {
        path: "$event",  // Flatten the event array
        preserveNullAndEmptyArrays: true  // If no event is found, it will be null
      }
    },
    // Lookup to fetch organization details using organizationId
    {
      $lookup: {
        from: "organizations",  // The organizations collection
        localField: "organizationId",  // Match organizationId from UserReservations
        foreignField: "_id",  // Match _id in organizations collection
        as: "organization"  // Store results in "organization" field
      }
    },
    {
      $unwind: {
        path: "$organization",  // Flatten the organization array
        preserveNullAndEmptyArrays: true  // If no organization is found, it will be null
      }
    },
    {
      $lookup: {
        from: "menuorders",
        localField: "preOrderMenuItemsOrder",
        foreignField: "_id",
        as: "preOrderMenuItemsOrder"
      }
    },
    {
      $unwind: {
        path: "$preOrderMenuItemsOrder",
        preserveNullAndEmptyArrays: true
      }
    },
    // Project necessary fields, including user, event, and organization details
    {
      $project: {
        userId: 1,
        partySize: 1,
        amount: 1,
        timingSlots: 1,
        status: 1,
        createdAt: 1,
        updatedAt: 1,
        organizationId: 1,
        companyOrganizer: 1,
        optionalEventId: 1,
        userName: {
          $concat: ["$user.firstName", " ", "$user.lastName"]  // Concatenate firstName and lastName
        },
        profileIcon: "$user.profileIcon",  // Fetch profileIcon
        eventTitle: "$event.basicInfo.title",  // Fetch event title
        eventImage: "$event.basicInfo.media.name",  // Fetch event image URL
        organizationTitle: "$organization.basicInfo.name",  // Fetch organization title
        organizationLogo: "$organization.basicInfo.media.logo",  // Fetch organization logo
        organizationCover: "$organization.basicInfo.media.cover",  // Fetch organization cover image
        preOrderMenuItemsOrder: 1,
        ticketingBookingRefs: 1,

      }
    },
    // Sort by createdAt in descending order
    { $sort: { createdAt: -1 } },

    // Pagination
    {
      $facet: {
        data: [{ $skip: skip }, ...(limit === 0 ? [] : [{ $limit: limit }])],
        totalFiltered: [{ $count: "count" }]
      }
    }
  ];

  // Run the aggregation pipeline
  const result = await UserReservations.aggregate(pipeline);

  const reservations = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Fetch counts for different statuses
  const [total, active, inactive] = await Promise.all([
    UserReservations.countDocuments({ ...query, status: { $ne: "deleted" } }),
    UserReservations.countDocuments({ ...query, status: "active" }),
    UserReservations.countDocuments({ ...query, status: "inactive" }),
  ]);

  // Generate meta information for pagination
  const meta = {
    page,
    limit,
    totalFiltered,
    reservationsCount: { total, active, inactive },
  };

  return { reservations, meta };
};

const getUserReservationDetails = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error("Invalid Reservation ID");
  }

  try {
    const reservationId = new mongoose.Types.ObjectId(id);

    const pipeline = [
      // 1️⃣ Match reservation
      {
        $match: { _id: reservationId }
      },

      // 2️⃣ Lookup unified wallet transactions (entityId = reservation._id)
      {
        $lookup: {
          from: "unifiedwallettransactions",
          let: { reservationId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$entityId", "$$reservationId"] },
              },
            },
            {
              $project: {
                walletType: 1,
                points: "$points.total",
              },
            },
          ],
          as: "transactions",
        },
      },
      //also lookup reservations to get reservationType
      {
        $lookup: {
          from: "reservations",
          localField: "reservationId",
          foreignField: "_id",
          as: "reservationDetails",
        }
      },
      //undwind reservationDetails
      {
        $unwind: {
          path: "$reservationDetails",
          preserveNullAndEmptyArrays: true
        }
      },

      // 3️⃣ Convert transactions array → object
      {
        $addFields: {
          transactions: {
            $arrayToObject: {
              $map: {
                input: "$transactions",
                as: "tx",
                in: {
                  k: "$$tx.walletType",
                  v: {
                    points: "$$tx.points",
                  },
                },
              },
            },
          },
        },
      },

      // 4️⃣ Convert optionalEventId
      {
        $addFields: {
          optionalEventId: { $toObjectId: "$optionalEventId" }
        }
      },

      // 5️⃣ Lookup Event
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
      },

      // 6️⃣ Lookup Organization
      {
        $lookup: {
          from: "organizations",
          localField: "organizationId",
          foreignField: "_id",
          as: "organization"
        }
      },
      {
        $unwind: {
          path: "$organization",
          preserveNullAndEmptyArrays: true
        }
      },

      // 7️⃣ Lookup User
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user"
        }
      },
      {
        $unwind: {
          path: "$user",
          preserveNullAndEmptyArrays: true
        }
      },

      // 8️⃣ Lookup Venue
      {
        $lookup: {
          from: "venues",
          localField: "event.basicInfo.venue",
          foreignField: "_id",
          as: "venue"
        }
      },
      {
        $unwind: {
          path: "$venue",
          preserveNullAndEmptyArrays: true
        }
      },

      // 9️⃣ Lookup Pre-order Menu Order
      {
        $lookup: {
          from: "menuorders",
          localField: "preOrderMenuItemsOrder",
          foreignField: "_id",
          as: "preOrderMenuItemsOrder"
        }
      },
      {
        $unwind: {
          path: "$preOrderMenuItemsOrder",
          preserveNullAndEmptyArrays: true
        }
      },

      // 🔟 Final projection
      {
        $project: {
          organizationId: "$organization._id",
          organizationName: "$organization.basicInfo.name",
          organizationLogo: "$organization.basicInfo.media.logo",
          eventName: "$event.basicInfo.title",
          eventStartDate: "$event.schedule.startDateTime",
          userName: { $concat: ["$user.firstName", " ", "$user.lastName"] },
          venueFullAddress: "$venue.location.fullAddress",
          reservationType: "$reservationDetails.reservationType",

          transactions: 1, // ✅ included here

          _id: 1,
          userId: 1,
          amount: 1,
          timingSlots: 1,
          needsConfirmation: 1,
          companyOrganizer: 1,
          optionalEventId: 1,
          createdAt: 1,
          updatedAt: 1,
          preOrderMenuItemsOrder: 1,
          ticketingBookingRefs: 1,
          paymentDetails: 1,
          reservationSnapshot: 1,
          status: 1,
        }
      },

      { $sort: { createdAt: -1 } }
    ];

    const reservation = await UserReservations.aggregate(pipeline);

    return reservation[0] || null;
  } catch (error) {
    throw error;
  }
};



const getOrganizationsWithReservationsForHome = async ({
  userId,
  userLocation,
  radiusKm = 50,
  timezone,
  limit = 10,
  category
}) => {

  limit = Math.min(limit, 10);
  const radiusMeters = radiusKm * 1000;

  const categoryObjectId = category
    ? new mongoose.Types.ObjectId(category)
    : null;

  // user interests
  const prefs = await getUserInterestsIdsForRecommendation(userId);
  const userCategories = prefs?.categories || [];
  const userTags = prefs?.tags || [];

  const baseMatch = {
    status: "active",
    ...(categoryObjectId && {
      "otherInfo.categories": { $in: [categoryObjectId] }
    })
  };

  const pipeline = [];

  // GEO
  if (userLocation) {
    pipeline.push({
      $geoNear: {
        near: userLocation,
        key: "location",
        distanceField: "distance",
        spherical: true,
        maxDistance: radiusMeters,
        query: baseMatch
      }
    });
  } else {
    pipeline.push({ $match: baseMatch });
  }

  // RESERVATIONS FILTER
  pipeline.push(
    {
      $lookup: {
        from: "reservations",
        let: { orgId: "$_id", now: new Date() },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$organizationId", "$$orgId"] },
                  { $eq: ["$status", "active"] },
                  { $gt: ["$availableReservations", 0] },
                  { $eq: ["$timingSlots.enabled", true] }
                ]
              }
            }
          },
          { $unwind: "$timingSlots.dateTimeSlots" },
          { $unwind: "$timingSlots.dateTimeSlots.timeSlots" },
          {
            $match: {
              $expr: {
                $and: [
                  {
                    $gt: [
                      "$timingSlots.dateTimeSlots.timeSlots.endTime",
                      "$timingSlots.dateTimeSlots.timeSlots.startTime"
                    ]
                  },
                  {
                    $gt: [
                      "$timingSlots.dateTimeSlots.timeSlots.endTime",
                      "$$now"
                    ]
                  }
                ]
              }
            }
          },
          { $count: "count" }
        ],
        as: "reservations"
      }
    },
    {
      $addFields: {
        reservationCount: {
          $ifNull: [{ $first: "$reservations.count" }, 0]
        },
        reservationsAvailable: {
          $gt: [{ $ifNull: [{ $first: "$reservations.count" }, 0] }, 0]
        }
      }
    },
    { $match: { reservationsAvailable: true } }
  );

  // RELEVANCE
  pipeline.push(
    {
      $addFields: {
        matchedCategories: {
          $size: {
            $setIntersection: ["$otherInfo.categories", userCategories]
          }
        },
        matchedTags: {
          $size: {
            $setIntersection: ["$otherInfo.tags", userTags]
          }
        }
      }
    },
    {
      $addFields: {
        relevanceScore: {
          $round: [
            {
              $add: [
                {
                  $multiply: [
                    0.6,
                    userCategories.length
                      ? { $divide: ["$matchedCategories", userCategories.length] }
                      : 0
                  ]
                },
                {
                  $multiply: [
                    0.4,
                    userTags.length
                      ? { $divide: ["$matchedTags", userTags.length] }
                      : 0
                  ]
                }
              ]
            },
            2
          ]
        }
      }
    }
  );

  // ENGAGEMENT SCORE
  pipeline.push(
    {
      $lookup: {
        from: "engagementevents",
        let: { orgId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$entityType", "organizations"] },
                  { $eq: ["$entityId", "$$orgId"] }
                ]
              }
            }
          },
          { $count: "count" }
        ],
        as: "engagement"
      }
    },
    {
      $addFields: {
        reviewsCount: {
          $ifNull: [{ $first: "$engagement.count" }, 0]
        }
      }
    }
  );

  // FINAL SCORE
  pipeline.push(
    {
      $addFields: {
        finalScore: {
          $round: [
            {
              $add: [
                { $multiply: [{ $ln: { $add: [1, "$reservationCount"] } }, 0.3] },
                { $multiply: [{ $ln: { $add: [1, "$reviewsCount"] } }, 0.3] },
                { $multiply: ["$relevanceScore", 0.4] }
              ]
            },
            2
          ]
        }
      }
    },
    { $sort: { finalScore: -1 } },
    { $limit: limit }
  );

  /* ----------------------------------
     ➕ TAGS + PRIMARY VENUE (ADDED)
     ---------------------------------- */
  pipeline.push(
    // PRIMARY VENUE
    {
      $lookup: {
        from: "venues",
        let: { orgId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$organization", "$$orgId"] },
              isPrimary: true,
              status: "active"
            }
          },
          { $project: { _id: 0, title: 1 } }
        ],
        as: "primaryVenue"
      }
    },

    // TAGS
    {
      $lookup: {
        from: "tags",
        localField: "otherInfo.tags",
        foreignField: "_id",
        as: "tags",
        pipeline: [{ $project: { _id: 1, title: 1 } }]
      }
    },

    // FINAL SHAPE
    {
      $project: {
        _id: 1,
        distance: userLocation ? 1 : null,

        "basicInfo.name": 1,
        "basicInfo.media": 1,

        operatingHours: 1,

        tags: 1,

        venue: {
          title: { $ifNull: [{ $first: "$primaryVenue.title" }, null] }
        },

        reservationsAvailable: 1,
        reservationCount: 1,

        explain: {
          relevanceScore: 1,
          reviewsCount: 1,
          finalScore: 1
        }
      }
    }
  );

  const results = await Organizations.aggregate(pipeline).allowDiskUse(true);

  return results;
};


const getOrganizationReservations = async ({ organizationId }) => {
  if (!organizationId) return [];

  const orgId = new mongoose.Types.ObjectId(organizationId);
  const now = new Date(); // UTC only

  const results = await Reservations.aggregate([
    // 1️⃣ ORG + ACTIVE
    {
      $match: {
        organizationId: orgId,
        status: "active",
        "timingSlots.enabled": true
      }
    },

    // 2️⃣ UNWIND
    { $unwind: "$timingSlots.dateTimeSlots" },
    { $unwind: "$timingSlots.dateTimeSlots.timeSlots" },

    // 3️⃣ FUTURE SLOT FILTER
    {
      $match: {
        $expr: {
          $and: [
            {
              $gt: [
                "$timingSlots.dateTimeSlots.timeSlots.endTime",
                "$timingSlots.dateTimeSlots.timeSlots.startTime"
              ]
            },
            {
              $gt: [
                "$timingSlots.dateTimeSlots.timeSlots.endTime",
                now
              ]
            }
          ]
        }
      }
    },

    // 4️⃣ GROUP BACK (THIS IS THE MISSING PIECE)
    {
      $group: {
        _id: {
          reservationId: "$_id",
          dateBlockId: "$timingSlots.dateTimeSlots._id"
        },
        reservation: { $first: "$$ROOT" },
        timeSlots: {
          $push: "$timingSlots.dateTimeSlots.timeSlots"
        }
      }
    },

    // 5️⃣ REBUILD dateTimeSlots
    {
      $addFields: {
        "reservation.timingSlots.dateTimeSlots": [
          {
            _id: "$_id.dateBlockId",
            date: "$reservation.timingSlots.dateTimeSlots.date",
            timeSlots: "$timeSlots"
          }
        ]
      }
    },

    // 6️⃣ FLATTEN ROOT
    {
      $replaceRoot: {
        newRoot: "$reservation"
      }
    },

    // 7️⃣ FINAL GROUP (ONE DOC PER RESERVATION)
    {
      $group: {
        _id: "$_id",
        doc: { $first: "$$ROOT" }
      }
    },
    {
      $replaceRoot: { newRoot: "$doc" }
    }
  ]);

  return results;
};


const getReservationForTransfer = async (id) => {
  return UserReservations.findById(id)
    .select("_id userId transferHistory");
};


module.exports = {
  createReservation,
  getReservationsWithFilters,
  countReservations,
  findReservationById,
  updateReservationData,
  deleteReservationById,
  findByIdAndUpdate,
  getReservations,
  getUserReservations,
  findUserReservationById,
  getUserReservationDetails,
  getOrganizationsWithReservationsForHome,
  getOrganizationReservations,
  getReservationForTransfer
};