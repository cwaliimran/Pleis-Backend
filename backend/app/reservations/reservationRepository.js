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
const { resolveChallengeByTaskTypeService } = require("../loyalty/challengesOrders/challengeOrdersService");
const { calculatePointsRepo } = require("../loyalty/calculatePointsEarning/pointsEarningsRepository");
const { createTransaction } = require("../userWalletService/transactions/services/unifiedTransactionsService");
const createReservation = async (data) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId, reservationId, partySize, preOrderMenuItems, timezone } = data;

    // Fetch user profile
    const userData = await User.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(userId) } },
      { $project: { firstName: 1, lastName: 1, phoneNumber: 1 } }
    ]);

    if (!userData?.length) throw new Error("User not found");

    data.firstName = userData[0].firstName || "";
    data.lastName = userData[0].lastName || "";
    data.phoneNumber = userData[0].phoneNumber || "";

    // Get reservation base price
    const reservation = await Reservations.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(reservationId) } },
      { $project: { amount: { $toDouble: { $ifNull: ["$amount", 0] } } } }
    ]);

    const amountPerPerson = reservation.length > 0 ? reservation[0].amount : 0;
    const totalReservationAmount = amountPerPerson * partySize;
    data.amount = totalReservationAmount;

    // SAVE reservation inside session
    const userReservation = new UserReservations(data);
    await userReservation.save({ session });

    // If pre-order exists -> create order
    if (preOrderMenuItems?.items?.length) {
      const order = await placePreOrderMenuItemsWithReservation({
        userId,
        timezone,
        items: preOrderMenuItems.items,
        notes: preOrderMenuItems.notes,
        reservation: userReservation._id,
        paymentMethod: data.paymentMethod,
        session,
      });

      userReservation.preOrderMenuItemsOrder = order._id;


      if (data.paymentMethod === "applePay" || data.paymentMethod === "card") {
        order.paymentStatus = "paid";
        //TODO save paymentId
        order.paymentId = data.paymentId || null;
        await order.save({ session });

        //totalPrice including menu items + reservation amount
        const totalPrice = order.totalPrice + totalReservationAmount;


        const pointsCalculation =
          await calculatePointsRepo(userId, data.companyOrganizer, totalPrice);

        const trx = await createTransaction(
          {
            user: userId,
            companyOrganizer: data.companyOrganizer,
            organization: data.organizationId,
            companyPoints: {
              base: pointsCalculation.organizer.earnedPoints,
              multiplier: 1,
              total: pointsCalculation.organizer.earnedPoints,
              pointsPerEuro: pointsCalculation.organizer.pointsPerEuro,
            },
            globalPoints: {
              base: pointsCalculation.global.earnedPoints,
              multiplier: 1,
              total: pointsCalculation.global.earnedPoints,
              pointsPerEuro: pointsCalculation.global.pointsPerEuro,
            },
            allowNegative: false,
            type: "earn",
            description: "",
            entityId: userReservation._id,
            domainType: "userreservations",
          },
          session
        );

        if (!trx.success) {
          throw new Error(trx.message || "failed_loyalty_update");
        }

        try {
          await resolveChallengeByTaskTypeService({
            userId,
            companyOrganizer: data.companyOrganizer,
            taskType: "buyMenuItem",
            items: data.preOrderMenuItems.items
          });
        } catch (err) {
          console.error("Challenge resolve failed", err);
        }

      }

      await userReservation.save({ session });

    }

    await session.commitTransaction();
    session.endSession();

    return userReservation;

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
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

const getReservations = async ({ timezone, page, limit, keyword, status, userId, eventId, organizationId, date }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const pipeline = [];

  // MATCH BASE FILTERS
  const match = {};

  if (eventId) {
    match.optionalEventId = eventId;
  }

  if (organizationId) {
    match.organizationId = new mongoose.Types.ObjectId(organizationId);
  }

  pipeline.push({ $match: match });

  // STATUS FILTER
  if (status) {
    pipeline.push({ $match: { status } });
  } else {
    pipeline.push({ $match: { status: { $ne: "deleted" } } });
  }

  // DATE FILTER
  console.log("date", date);
  if (date) {
    // Convert: "2025-12-16T19:00:00.000+00:00" -> "2025-12-16"
    const dayOnly = date.split("T")[0];

    // Build date range
    const start = new Date(`${dayOnly}T00:00:00.000Z`);
    const end = new Date(`${dayOnly}T23:59:59.999Z`);

    console.log("DATE RANGE:", start, end);

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
      }
    );
  }





  // KEYWORD SEARCH
  if (keyword) {
    const keywordMatch = buildKeywordQueryFromModels([{ schema: Reservations.schema }], keyword);

    if (Object.keys(keywordMatch).length) {
      pipeline.push({ $match: keywordMatch });
    }
  }

  // SORT
  pipeline.push({ $sort: { createdAt: -1 } });

  // PAGINATION
  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        ...(limit === 0 ? [] : [{ $limit: limit }])
      ],
      totalFiltered: [{ $count: "count" }]
    }
  });
  console.log("pipeline", pipeline);
  const result = await Reservations.aggregate(pipeline);
  const reservations = result[0]?.data || [];
  console.log("reservations", reservations);
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // META COUNT
  const [total, active, inactive] = await Promise.all([
    Reservations.countDocuments({ ...(userId && { userId }), status: { $ne: "deleted" } }),
    Reservations.countDocuments({ status: "active", ...(userId && { userId }) }),
    Reservations.countDocuments({ status: "inactive", ...(userId && { userId }) })
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.reservationsCount = { total, active, inactive };

  // FORMAT OUTPUT
  const finalReservations = reservations.map(item => {
    const formatted = reservationsFormatter(item);
    if (
      formatted.conditionType === "noCondition" ||
      formatted.conditionType === "ticketRequirement" ||
      formatted.conditionType === "customText"
    ) {
      delete formatted.amount;
      if (formatted.conditionType === "noCondition") delete formatted.ticketType;
    } else {
      delete formatted.ticketType;
    }
    return formatted;
  });

  return { reservations: finalReservations, meta };
};


const getUserReservations = async ({ timezone, page, limit, userId, date }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  if (date) {
    date = convertToUtcDateOnly(date, "UTC");
  }
  console.log("date", date);
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
    // Project necessary fields, including user, event, and organization details
    {
      $project: {
        userId: 1,
        partySize: 1,
        reservationType: 1,
        amount: 1,
        timingSlots: 1,
        status: 1,
        createdAt: 1,
        updatedAt: 1,
        organizationId: 1,
        companyOrganizer: 1,
        optionalEventId: 1,
        reservationStatus: 1,
        userName: {
          $concat: ["$user.firstName", " ", "$user.lastName"]  // Concatenate firstName and lastName
        },
        profileIcon: "$user.profileIcon",  // Fetch profileIcon
        eventTitle: "$event.basicInfo.title",  // Fetch event title
        eventImage: "$event.basicInfo.media.name",  // Fetch event image URL
        organizationTitle: "$organization.basicInfo.name",  // Fetch organization title
        organizationLogo: "$organization.basicInfo.media.logo",  // Fetch organization logo
        organizationCover: "$organization.basicInfo.media.cover",  // Fetch organization cover image
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
    const pipeline = [
      {
        $match: { _id: new mongoose.Types.ObjectId(id) }
      },

      {
        $addFields: {
          optionalEventId: { $toObjectId: "$optionalEventId" }
        }
      },

      // Lookup Event
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

      // Lookup Organization
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

      // Lookup User
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

      // ⭐ NEW: Lookup Venue using venueID
      {
        $lookup: {
          from: "venues",                         // <── your venues table name
          localField: "event.basicInfo.venue",    // <── the venueID
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

      // Project Final fields
      {
        $project: {
          organizationId: "$organization._id",
          organizationName: "$organization.basicInfo.name",
          organizationLogo: "$organization.basicInfo.media.logo",
          eventName: "$event.basicInfo.title",
          eventStartDate: "$event.schedule.startDateTime",
          userName: { $concat: ["$user.firstName", " ", "$user.lastName"] },
          venueFullAddress: "$venue.location.fullAddress",


          _id: 1,
          userId: 1,
          reservationType: 1,
          amount: 1,
          timingSlots: 1,
          needsConfirmation: 1,
          companyOrganizer: 1,
          optionalEventId: 1,
          createdAt: 1,
          updatedAt: 1
        }
      },

      { $sort: { createdAt: -1 } }
    ];



    // Run the aggregation pipeline
    const reservation = await UserReservations.aggregate(pipeline);

    // Check if no reservation found
    if (!reservation || reservation.length === 0) {

      return null;  // Return null if no reservation found
    }


    return reservation[0];  // Return the first result (since we match by ID)
  } catch (error) {

    throw error;  // Propagate the error for further handling
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
    console.error("getOrganizationReservations error:", error);
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