// repositories/ReservationRepository.js
const Reservations = require("@ReservationsModel");
const UserReservations = require("@UserReservationsModel");
const {User} = require("@UserModel");
const mongoose = require("mongoose");
const { reservationsFormatter } = require("./formaters/reservationFormetter");
const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  getStartAndEndOfMonth,
  getStartAndEndOfWeek,
  convertToUtcDateOnly,
} = require("../../helperUtils/responseUtil");
const createReservation = async (data) => {
  try {
    const { userId, reservationId, partySize } = data;

    const userData = await User.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(userId) } },
      {
        $project: {
          firstName: 1,
          lastName: 1,
          phoneCode: "$phoneNumber.code",
          phoneNumber: "$phoneNumber.number"
        }
      }
    ]);

    if (!userData || userData.length === 0) {
      throw new Error("User not found");
    }

    data.firstName = userData[0].firstName || "";
    data.lastName = userData[0].lastName || "";
    data.phoneNumber = {
      code: userData[0].phoneCode || "",
      number: userData[0].phoneNumber || ""
    };

    const reservation = await Reservations.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(reservationId) } },
      {
        $project: {
          amount: { $toDouble: { $ifNull: ["$amount", 0] } }
        }
      }
    ]);

    const amountPerPerson = reservation.length > 0 ? reservation[0].amount : 0;

    data.amount = amountPerPerson * partySize;

    const userReservation = new UserReservations(data);
    await userReservation.save();

    return userReservation;
  } catch (err) {
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
  console.log("date",date );
if (date) {
  // Convert: "2025-12-16T19:00:00.000+00:00" -> "2025-12-16"
  const dayOnly = date.split("T")[0];

  // Build date range
  const start = new Date(`${dayOnly}T00:00:00.000Z`);
  const end   = new Date(`${dayOnly}T23:59:59.999Z`);

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
  console.log("reservations",reservations );
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
  if (date){
    date=convertToUtcDateOnly(date,"UTC");
  }
console.log("date",date );
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
      organizationName: "$organization.basicInfo.name",
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
};