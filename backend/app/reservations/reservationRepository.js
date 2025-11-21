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




const getReservations = async ({ timezone,page,limit,keyword,status,userId,eventId,organizationId,date}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
    const organizationIdObj = organizationId ? new mongoose.Types.ObjectId(organizationId) : null;

  const pipeline = [
  {
    $match: {
        ...(eventId && { optionalEventId: eventId }), 
        ...(organizationIdObj && { 
          organizationId: organizationIdObj 
        }),
      }
  }
];
  // Apply filters
  if (status) {
    pipeline.push({ $match: { status } });
  } else {
    pipeline.push({ $match: { status: { $ne: "deleted" } } });
  }
  if (date) {
    const start = new Date(date);  
    const end = new Date(new Date(date).setDate(start.getDate() + 1)); 
    pipeline.push(
      { $unwind: "$timingSlots.dateTimeSlots" }, 
      {
        $project: {
          reservationType: 1,  // Keep other fields
          availableReservations: 1,
          companyOrganizer: 1,
          companyOrganizer: 1,
          maxCapacityPerReservation: 1,
          conditionType: 1,
          organizationId: 1,
          taxPercentage: 1,
          timingSlots: 1,  
          needsConfirmation: 1,
          optionalEventId: 1,
          status: 1,
          createdAt: 1,
          updatedAt: 1,
          __v: 1,
          date: {
            $dateToString: { format: "%Y-%m-%d", date: "$timingSlots.dateTimeSlots.date" } 
          }
        }
      },
      {
        $match: {
          "timingSlots.enabled": true, 
          date: { $gte: start.toISOString().split("T")[0], $lt: end.toISOString().split("T")[0] } 
        }
      }
    );
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
  console.log("reservations",reservations );

  const [total, active, inactive] = await Promise.all([
    Reservations.countDocuments({ ...(userId && { userId: userId }), status: { $ne: "deleted" } }),
    Reservations.countDocuments({ status: "active", ...(userId && { userId: userId }) }),
    Reservations.countDocuments({ status: "inactive", ...(userId && { userId: userId }) })
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.reservationsCount = { total, active, inactive };


  reservations = reservations.map(item => {
    const formatted = reservationsFormatter(item);
    if (formatted.conditionType == "noCondition"||formatted.conditionType=="ticketRequirement"||formatted.conditionType=="customText"||formatted.conditionType=="ticketRequirement") {
      delete formatted.amount;
      if(formatted.conditionType == "noCondition")
      {
      delete formatted.ticketType;
      }
    }
    else{
            delete formatted.ticketType;
    }
    return formatted;
  });
  return {reservations , meta}
}










const getUserReservations = async ({ timezone, page, limit, keyword, status, userId, date }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

const pipeline = [
  // Match by userId
  {
    $match: {
      ...(userId && { userId: userId }),  // Match by userId if provided
    }
  },

  // Apply status filter
  ...(status ? [{ $match: { status } }] : [{ $match: { status: { $ne: "deleted" } } }]),

  // Apply date filter if provided
  ...(date ? [
    { $unwind: "$timingSlots.dateTimeSlots" },  // Flatten dateTimeSlots array
    {
      $project: {
        reservationType: 1,
        availableReservations: 1,
        maxCapacityPerReservation: 1,
        conditionType: 1,
        amount: 1,
        partySize: 1,
        organizationId: 1,
        taxPercentage: 1,
        reservationType: 1,
        timingSlots: 1,
        needsConfirmation: 1,
        companyOrganizer: 1,
        optionalEventId: 1,
        status: 1,
        createdAt: 1,
        updatedAt: 1,
        location: 1,
        venueID: 1,
        __v: 1,
        date: { 
          $dateToString: { 
            format: "%Y-%m-%d", 
            date: "$timingSlots.dateTimeSlots.date" 
          } 
        }
      }
    },
    {
      $match: {
        "timingSlots.enabled": true,
        date: {
          $gte: new Date(date).toISOString().split("T")[0], 
          $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)).toISOString().split("T")[0]
        }
      }
    }
  ] : []),

  // Convert optionalEventId to ObjectId to ensure it matches the events _id field
  {
    $addFields: {
      optionalEventId: { $toObjectId: "$optionalEventId" }  // Convert to ObjectId if it's a string
    }
  },

  // Lookup to fetch event details using optionalEventId
  {
    $lookup: {
      from: "events",  // The events collection
      localField: "optionalEventId",  // Match on optionalEventId field in reservations
      foreignField: "_id",  // Match with _id in events collection
      as: "event"  // Store results in the "event" field
    }
  },
  {
    $unwind: {
      path: "$event",  // Flatten the event array (it should only contain one event)
      preserveNullAndEmptyArrays: true  // If no event is found, it will be null
    }
  },

  // Lookup to fetch organization details using organizationId
  {
    $lookup: {
      from: "organizations",  // The organizations collection
      localField: "organizationId",  // Match on organizationId field in reservations
      foreignField: "_id",  // Match with _id in organizations collection
      as: "organization"  // Store results in the "organization" field
    }
  },
  {
    $unwind: {
      path: "$organization",  // Flatten the organization array (it should only contain one organization)
      preserveNullAndEmptyArrays: true  // If no organization is found, it will be null
    }
  },

  // Lookup to fetch user details using userId
  {
    $lookup: {
      from: "users",  // The users collection
      localField: "userId",  // Match on userId field in reservations
      foreignField: "_id",  // Match with _id in users collection
      as: "user"  // Store results in "user" field
    }
  },
  {
    $unwind: {
      path: "$user",  // Flatten the user array (it should only contain one user)
      preserveNullAndEmptyArrays: true  // If no user is found, it will be null
    }
  },

  // Project the necessary fields and include eventName, organizationName, event image, organization image, and userName
  {
    $project: {
      organizationName: "$organization.basicInfo.name",  // Organization name
      eventName: "$event.basicInfo.title",  // Event name
      eventImage: "$event.basicInfo.media.name",  // Event image URL
      organizationImage: "$organization.basicInfo.media.cover",  // Organization image (logo or cover)
      userName: { 
        $concat: ["$user.firstName", " ", "$user.lastName"]  // Concatenate firstName and lastName to form full userName
      },


      

      _id: 1,
      userId: 1,
      partySize: 1,
      reservationType: 1,
      amount: 1,
      reservationType: 1,
      timingSlots: 1,
      needsConfirmation: 1,
      companyOrganizer: 1,
      optionalEventId: 1,
      status: 1,
      createdAt: 1,
      updatedAt: 1
    }
  },

  // Sort by createdAt in descending order
  { $sort: { createdAt: -1 } },

  // Pagination and counting
  {
    $facet: {
      data: [{ $skip: skip }, ...(limit === 0 ? [] : [{ $limit: limit }])],
      totalFiltered: [{ $count: "count" }]
    }
  }
];



  // Run the aggregation pipeline
  const result = await UserReservations.aggregate(pipeline);

  let reservations = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Fetch total counts for different statuses
  const [total, active, inactive] = await Promise.all([
    UserReservations.countDocuments({ ...(userId && { userId: userId }), status: { $ne: "deleted" } }),
    UserReservations.countDocuments({ status: "active", ...(userId && { userId: userId }) }),
    UserReservations.countDocuments({ status: "inactive", ...(userId && { userId: userId }) })
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.reservationsCount = { total, active, inactive };

  // Formatting and adding event and organization data
  reservations = reservations.map(item => {
    const formatted = reservationsFormatter(item);

    if (formatted.conditionType == "noCondition" || formatted.conditionType == "ticketRequirement" || formatted.conditionType == "customText") {
      delete formatted.amount;
      if (formatted.conditionType == "noCondition") {
        delete formatted.ticketType;
      }
    } else {
      delete formatted.ticketType;
    }

    // Add event name and organization name if they exist
    if (item.event && item.event.title) {
      formatted.eventName = item.event.title;
    }
    if (item.organization && item.organization.name) {
      formatted.organizationName = item.organization.name;
    }

    return formatted;
  });

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