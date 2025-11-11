// repositories/ReservationRepository.js
const Reservations = require("@ReservationsModel");
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
      ...(userId && { userId: new mongoose.Types.ObjectId(userId) }),
      ...(organizationsIds.length > 0 && { organizationId: { $in: organizationsIds } }) // Match as ObjectId
    }
  }
];
if (range == "monthly") {
  const { start, end } = getStartAndEndOfMonth(today, timezone);
  console.log("Month Range:", { start, end });
  pipeline.push({
    $match: {
      createdAt: { $gte: start, $lt: end }
    }
  });
}
if (range == "weekly") {
  const { start, end } = getStartAndEndOfWeek(today, timezone);
  console.log("Week Range:", { start, end });
  pipeline.push({
    $match: {
      createdAt: { $gte: start, $lt: end }
    }
  });
}
if (range == "today") {
    const start = new Date(today);
    const end = new Date(new Date(today).setDate(start.getDate() + 1));
  console.log("Today Range:", { start, end });
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

module.exports = {
  createReservation,
  getReservationsWithFilters,
  countReservations,
  findReservationById,
  updateReservationData,
  deleteReservationById,
  findByIdAndUpdate,
  getReservations,
};