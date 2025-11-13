// repositories/ReservationRepository.js
const Reservations = require("@ReservationsModel");
const UserReservations = require("@UserReservationsModel");
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
    const Reservation = new UserReservations(data);
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
          userId: 1,
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
   // Check if userId is correctly passed here
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const pipeline = [
  {
     $match: {
        ...(userId && { userId: userId }),  // Match by userId
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
          maxCapacityPerReservation: 1,
          conditionType: 1,
          organizationId: 1,
          taxPercentage: 1,
          timingSlots: 1,  
          needsConfirmation: 1,
          companyOrganizer: 1,
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
      { schema: UserReservations.schema }
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
 

  const result = await UserReservations.aggregate(pipeline);

  let reservations = result[0]?.data || [];

  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  const [total, active, inactive] = await Promise.all([
    UserReservations.countDocuments({ ...(userId && { userId: userId }), status: { $ne: "deleted" } }),
    UserReservations.countDocuments({ status: "active", ...(userId && { userId: userId }) }),
    UserReservations.countDocuments({ status: "inactive", ...(userId && { userId: userId }) })
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
};