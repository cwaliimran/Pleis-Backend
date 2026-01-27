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
} = require("../../helperUtils/responseUtil");
const { placePreOrderMenuItemsWithReservation } = require("../menuItemsAndOrdering/orders/orderService");
const { sendUserNotifications } = require("../../controllers/communicationController");
const { NotificationTypes } = require("@NotificationsModel");
const { getStaffIdsByOrganization } = require("../../admin/organizations/organizationRepository");
const createReservation = async (data, session) => {
  if (!session) throw new Error("session_required");

  const { userId, reservationId, partySize, preOrderMenuItems, timezone } = data;

  const capacityCheck = await validateReservationCapacity({
    reservationId,
    session

  });

  if (!capacityCheck.valid) {
    return {
      success: false,
      error: capacityCheck.error
    };
  }


  // Fetch user profile
  const userData = await User.aggregate(
    [
      { $match: { _id: new mongoose.Types.ObjectId(userId) } },
      { $project: { firstName: 1, lastName: 1, phoneNumber: 1 } },
    ],
    { session }
  );

  if (!userData?.length) throw new Error("User not found");

  data.firstName = userData[0].firstName || "";
  data.lastName = userData[0].lastName || "";
  data.phoneNumber = userData[0].phoneNumber || "";

  // Reservation base price
  const reservationBase = await Reservations.aggregate(
    [
      { $match: { _id: new mongoose.Types.ObjectId(reservationId) } },
      { $project: { amount: { $toDouble: { $ifNull: ["$amount", 0] } } } },
    ],
    { session }
  );

  const amountPerPerson = reservationBase[0]?.amount || 0;
  const totalReservationAmount = amountPerPerson * partySize;
  data.amount = totalReservationAmount;

  // Lock only for card / applePay
  if (["card", "applePay"].includes(data?.paymentDetails?.paymentMethod)) {
    data.lockUntil = new Date(Date.now() + 10 * 60 * 1000);
    data.status = "pendingPayment";
  }

  const userReservation = new UserReservations(data);
  await userReservation.save({ session });

  // Pre-order handling
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

    userReservation.preOrderMenuItemsOrder = order._id;
    //totalPrice including menu items + reservation amount
    const totalPrice = order.totalPrice + totalReservationAmount;
    userReservation.amount = totalPrice;
    userReservation.priceBreakDown = {
      reservationAmount: data?.amount,
      preOrderMenuItemsAmount: order.totalPrice,
    };
    await userReservation.save({ session });
  }
  await sendUserNotifications({
    recipientIds: [userReservation.userId.toString()],
    title: "Reservation Created",
    body: `Your reservation has been created successfully.`,
    data: {
      type: NotificationTypes.RESERVATION_UPDATE,
      objectType: "group",
    },
    image: "noimage",
    sender: userId,
    objectId: userReservation.reservationId,
  });
  const staffIds = await getStaffIdsByOrganization(userReservation.organizationId);
  await sendUserNotifications({
    recipientIds: staffIds,
    title: "A New Reservation Created",
    body: `A new reservation has been created successfully.`,
    data: {
      type: NotificationTypes.RESERVATION_UPDATE,
      objectType: "group",
    },
    image: "noimage",
    sender: userId,
    objectId: userReservation.reservationId,
  });

  return {
    success: true,
    reservation: userReservation
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
  date
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const now = new Date();

  const pipeline = [];

  // -----------------------------
  // 1️⃣ BASE MATCH
  // -----------------------------
  const match = {};

  if (eventId) {
    match.optionalEventId = new mongoose.Types.ObjectId(eventId);
  }

  if (organizationId) {
    match.organizationId = new mongoose.Types.ObjectId(organizationId);
  }

  pipeline.push({ $match: match });

  // -----------------------------
  // 2️⃣ STATUS FILTER (FIXED)
  // -----------------------------
  if (status) {
    pipeline.push({ $match: { status } });
  } else {
    pipeline.push({
      $match: {
        status: { $nin: ["pendingPayment", "deleted"] }
      }
    });
  }

  // -----------------------------
  // 3️⃣ DATE FILTER (SLOT-BASED, SAFE)
  // -----------------------------
  if (date) {
    const dayOnly = date.split("T")[0];
    const start = new Date(`${dayOnly}T00:00:00.000Z`);
    const end = new Date(`${dayOnly}T23:59:59.999Z`);

    pipeline.push(
      {
        $unwind: {
          path: "$timingSlots.dateTimeSlots",
          preserveNullAndEmptyArrays: false
        }
      },
      {
        $match: {
          "timingSlots.enabled": true,
          "timingSlots.dateTimeSlots.date": { $gte: start, $lte: end }
        }
      },
      {
        // Restore original document shape
        $group: {
          _id: "$_id",
          doc: { $first: "$$ROOT" }
        }
      },
      {
        $replaceRoot: { newRoot: "$doc" }
      }
    );
  }

  // -----------------------------
  // 4️⃣ KEYWORD SEARCH
  // -----------------------------
  if (keyword) {
    const keywordMatch = buildKeywordQueryFromModels(
      [{ schema: Reservations.schema }],
      keyword
    );

    if (Object.keys(keywordMatch).length) {
      pipeline.push({ $match: keywordMatch });
    }
  }

  // -----------------------------
  // 5️⃣ CAPACITY ENFORCEMENT
  // -----------------------------
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
                      {
                        $in: [
                          "$status",
                          ["confirmed", "checkedIn", "completed"]
                        ]
                      },
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
        as: "blockedReservations"
      }
    },
    {
      $addFields: {
        blockedCount: {
          $ifNull: [
            { $arrayElemAt: ["$blockedReservations.count", 0] },
            0
          ]
        },
        remainingReservations: {
          $subtract: [
            "$availableReservations",
            {
              $ifNull: [
                { $arrayElemAt: ["$blockedReservations.count", 0] },
                0
              ]
            }
          ]
        }
      }
    },
    {
      $match: {
        remainingReservations: { $gt: 0 }
      }
    }
  );

  // -----------------------------
  // 6️⃣ SORT
  // -----------------------------
  pipeline.push({ $sort: { createdAt: -1 } });

  // -----------------------------
  // 7️⃣ PAGINATION + COUNT
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
  // 8️⃣ EXECUTION
  // -----------------------------
  const result = await Reservations.aggregate(pipeline);

  const reservations = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  const meta = generateMeta(page, limit, totalFiltered);

  // -----------------------------
  // 9️⃣ FORMAT OUTPUT
  // -----------------------------
  const finalReservations = reservations.map(item => {
    const formatted = reservationsFormatter(item, timezone);

    // Cleanup based on conditionType
    if (
      formatted.conditionType === "noCondition" ||
      formatted.conditionType === "ticketRequirement" ||
      formatted.conditionType === "customText"
    ) {
      delete formatted.amount;
      if (formatted.conditionType === "noCondition") {
        delete formatted.ticketType;
      }
    } else {
      delete formatted.ticketType;
    }

    formatted.remainingReservations = item.remainingReservations;

    return formatted;
  });

  return { reservations: finalReservations, meta };
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

const getReservationDetails = async (id) => {
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


const getOrganizationReservations = async ({ organizationId, timezone }) => {
  try {
    if (!organizationId) return [];

    const orgId = new mongoose.Types.ObjectId(organizationId);

    const now = getCurrentDateInTimezone({ timezone });

    const results = await Reservations.aggregate([
      // ORG
      {
        $match: {
          organizationId: orgId,
          status: "active",
          "timingSlots.enabled": true
        }
      },

      // BREAK DOWN SLOTS
      { $unwind: "$timingSlots.dateTimeSlots" },
      { $unwind: "$timingSlots.dateTimeSlots.timeSlots" },

      // FUTURE ONLY (same logic you used)
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
      }
    ]);

    return results;
  } catch (error) {

    return [];
  }
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
  getReservationDetails,
  getOrganizationsWithReservationsForHome,
  getOrganizationReservations,
  getReservationForTransfer
};