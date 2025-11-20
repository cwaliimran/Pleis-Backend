// repositories/ReservationRepository.js
const Reservations = require("@ReservationsModel");
const UserReservations = require("@UserReservationsModel");
const { User } = require("../../models/UserModel");
const Event = require("@EventsModel");
const mongoose = require("mongoose");
const { reservationsFormatter, reservationsFormatterAdjustDates } = require("../../app/reservations/formaters/reservationFormetter");
const Organizations = require("@OrganizationModel")
const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  getStartAndEndOfMonth,
  getStartAndEndOfWeek,
} = require("../../helperUtils/responseUtil");
const getCreatorFromOrganization = async (organizationId) => {
  try {
    const result = await Organizations.aggregate([
      {
        $match: { _id:new mongoose.Types.ObjectId(organizationId) },  // Match the organization by its ID
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
    console.error("Error in aggregation:", err);
    throw err;
  }
};
const createReservation = async (data) => {
  try {
    console.log("Creating reservation with data:",await getCreatorFromOrganization(data.organizationId));
    data.companyOrganizer = await getCreatorFromOrganization(data.organizationId);
    const Reservation = new Reservations(data);
    await Reservation.save();
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




const getReservations = async ({ timezone,page, limit, keyword, status, userId, organizationsId, date, range,today,skip }) => {
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
  const { start, end } = getStartAndEndOfMonth(today, timezone);

  pipeline.push({
    $match: {
      createdAt: { $gte: start, $lt: end }
    }
  });
}
if (range == "weekly") {
  const { start, end } = getStartAndEndOfWeek(today, timezone);

  pipeline.push({
    $match: {
      createdAt: { $gte: start, $lt: end }
    }
  });
}
if (range == "today") {
    const start = new Date(today);
    const end = new Date(new Date(today).setDate(start.getDate() + 1));

  pipeline.push({
    $match: {
      createdAt: { $gte: start, $lt: end }
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
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    pipeline.push({
      $match: {
        createdAt: { $gte: start, $lt: end }
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
console.log("Pipeline:", JSON.stringify(pipeline, null, 2));
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


const getUserReservations = async ({ timezone, page, limit, keyword, status, userId, organizationsId, date, range, today, skip, reservationStatus,reservationId }) => {
  let organizationsIds = Array.isArray(organizationsId)
    ? organizationsId
    : JSON.parse(organizationsId || '[]');
  organizationsIds = organizationsIds.map(id => new mongoose.Types.ObjectId(id));

  const pipeline = [
    {
      $match: {
        ...(userId && { companyOrganizer: new mongoose.Types.ObjectId(userId) }),
        ...(organizationsIds.length > 0 && { organizationId: { $in: organizationsIds } }),
        ...(reservationStatus && { reservationStatus:reservationStatus }),
        ...(reservationId && { reservationId: new mongoose.Types.ObjectId(reservationId) })
      }
    },
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user"
      }
    },
    { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        validEventId: {
          $cond: {
            if: { $and: [{ $ne: ["$optionalEventId", ""] }, { $ne: ["$optionalEventId", null] }] },
            then: { $toObjectId: "$optionalEventId" },
            else: null
          }
        }
      }
    },
    {
      $lookup: {
        from: "events",
        localField: "validEventId",
        foreignField: "_id",
        as: "event"
      }
    },
    { $unwind: { path: "$event", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        userId: 1,
        userName: { $concat: ["$user.firstName", " ", "$user.lastName"] },
        partySize: 1,
        reservationType: 1,
        organizationId: 1,
        reservationStatus: 1,
        companyOrganizer: 1,
        reservationId: 1,
        timingSlots: 1,
        status: 1,
        optionalEventId: 1,
        createdAt: 1,
        updatedAt: 1,
        member: "Gold",
        eventTitle: { $ifNull: ["$event.basicInfo.title", "No Event Title"] }
      }
    }
  ];


if (range == "monthly") {
  const { start, end } = getStartAndEndOfMonth(today, timezone);

  pipeline.push({
    $match: {
      createdAt: { $gte: start, $lt: end }
    }
  });
}
if (range == "weekly") {
  const { start, end } = getStartAndEndOfWeek(today, timezone);

  pipeline.push({
    $match: {
      createdAt: { $gte: start, $lt: end }
    }
  });
}
if (range == "today") {
    const start = new Date(today);
    const end = new Date(new Date(today).setDate(start.getDate() + 1));

  pipeline.push({
    $match: {
      createdAt: { $gte: start, $lt: end }
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
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    pipeline.push({
      $match: {
        createdAt: { $gte: start, $lt: end }
      }
    });
  }

if (keyword) {
  const keywordMatch = buildKeywordQueryFromModels(
    [
      { schema: UserReservations.schema }
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

  const result = await UserReservations.aggregate(pipeline);

  let reservations = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Additional counts for meta (active/inactive/total by userId as creator)
  const [total, active, inactive] = await Promise.all([
    UserReservations.countDocuments({ ...(userId && { userId: userId }), reservationStatus: { $ne: "cancelled" } }),
    UserReservations.countDocuments({ reservationStatus: "active", ...(userId && { userId: userId }) }),
    UserReservations.countDocuments({ reservationStatus: "inactive", ...(userId && { userId: userId }) })
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.reservationsCount = { total, active, inactive };


  reservations = reservations.map(item => {
    const formatted = reservationsFormatterAdjustDates(item);
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



const findUserReservationById = async (id, data) => {
  return UserReservations.findByIdAndUpdate(id, data, { new: true });
};

const findUserById = async (id) => {
  return User.findById(id);
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
  findUserById,
};