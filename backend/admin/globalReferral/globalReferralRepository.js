// repositories/ReservationRepository.js
const {GlobalReferral} = require("@GlobalReferralModel");
const UserReservations = require("@UserReservationsModel");
const { User } = require("../../models/UserModel");
const Event = require("@EventsModel");
const mongoose = require("mongoose");
const { reservationsFormatter, reservationsFormatterAdjustDates } = require("../../app/reservations/formaters/reservationFormetter");
const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  getStartAndEndOfMonth,
  getStartAndEndOfWeek,
} = require("../../helperUtils/responseUtil");
const createGlobalReferral = async (data) => {
  try {
    const globalReferral = new GlobalReferral(data);
    await globalReferral.save();
    return globalReferral;
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
// const deleteReservationById = async (Reservation) => {
//   return await Reservation.deleteOne();
// };

//findByIdAndUpdate
// const findByIdAndUpdate = async (id, data) => {
//   return Reservations.findByIdAndUpdate(id, data, { new: true });
// };




const getGlobalReferrals = async ({ timezone,page, limit, keyword, status, userId, date, range,today,skip, type }) => {
  const pipeline = [
  {
$match: {
  ...(userId && { creator: new mongoose.Types.ObjectId(userId) }), // Match by userId if provided
  ...(type && { type: type }), // Match by type if provided (e.g., "global", "company", etc.)
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
      { schema: GlobalReferral.schema }
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

  const result = await GlobalReferral.aggregate(pipeline);
  console.log("result",result );

  let globalReferral = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;


  // Additional counts for meta (active/inactive/total by userId as creator)
  const [total, active, inactive] = await Promise.all([
    GlobalReferral.countDocuments({ ...(userId && { userId: userId }), status: { $ne: "deleted" } }),
    GlobalReferral.countDocuments({ status: "active", ...(userId && { userId: userId }) }),
    GlobalReferral.countDocuments({ status: "inactive", ...(userId && { userId: userId }) })
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.globalReferralCount = { total, active, inactive };


  console.log("globalReferral repository ",globalReferral );
  return {globalReferral , meta}
}


// const getUserReservations = async ({ timezone, page, limit, keyword, status, userId, organizationsId, date, range, today, skip, reservationStatus,reservationId }) => {
//   let organizationsIds = Array.isArray(organizationsId)
//     ? organizationsId
//     : JSON.parse(organizationsId || '[]');
//   organizationsIds = organizationsIds.map(id => new mongoose.Types.ObjectId(id));

//   const pipeline = [
//     {
//       $match: {
//         ...(userId && { companyOrganizer: new mongoose.Types.ObjectId(userId) }),
//         ...(organizationsIds.length > 0 && { organizationId: { $in: organizationsIds } }),
//         ...(reservationStatus && { reservationStatus:reservationStatus }),
//         ...(reservationId && { reservationId: new mongoose.Types.ObjectId(reservationId) })
//       }
//     },
//     {
//       $lookup: {
//         from: "users",
//         localField: "userId",
//         foreignField: "_id",
//         as: "user"
//       }
//     },
//     { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
//     {
//       $addFields: {
//         validEventId: {
//           $cond: {
//             if: { $and: [{ $ne: ["$optionalEventId", ""] }, { $ne: ["$optionalEventId", null] }] },
//             then: { $toObjectId: "$optionalEventId" },
//             else: null
//           }
//         }
//       }
//     },
//     {
//       $lookup: {
//         from: "events",
//         localField: "validEventId",
//         foreignField: "_id",
//         as: "event"
//       }
//     },
//     { $unwind: { path: "$event", preserveNullAndEmptyArrays: true } },
//     {
//       $project: {
//         _id: 1,
//         userId: 1,
//         userName: { $concat: ["$user.firstName", " ", "$user.lastName"] },
//         partySize: 1,
//         reservationType: 1,
//         organizationId: 1,
//         reservationStatus: 1,
//         companyOrganizer: 1,
//         reservationId: 1,
//         timingSlots: 1,
//         status: 1,
//         optionalEventId: 1,
//         createdAt: 1,
//         updatedAt: 1,
//         member: "Gold",
//         eventTitle: { $ifNull: ["$event.basicInfo.title", "No Event Title"] }
//       }
//     }
//   ];


// if (range == "monthly") {
//   const { start, end } = getStartAndEndOfMonth(today, timezone);

//   pipeline.push({
//     $match: {
//       createdAt: { $gte: start, $lt: end }
//     }
//   });
// }
// if (range == "weekly") {
//   const { start, end } = getStartAndEndOfWeek(today, timezone);

//   pipeline.push({
//     $match: {
//       createdAt: { $gte: start, $lt: end }
//     }
//   });
// }
// if (range == "today") {
//     const start = new Date(today);
//     const end = new Date(new Date(today).setDate(start.getDate() + 1));

//   pipeline.push({
//     $match: {
//       createdAt: { $gte: start, $lt: end }
//     }
//   });
// }
//   // Apply filters
//   if (status) {
//     pipeline.push({ $match: { status } });
//   } else {
//     pipeline.push({ $match: { status: { $ne: "deleted" } } });
//   }

//   if (date) {
//     const start = new Date(date);
//     const end = new Date(new Date(date).setDate(start.getDate() + 1));
//     pipeline.push({
//       $match: {
//         createdAt: { $gte: start, $lt: end }
//       }
//     });
//   }

// if (keyword) {
//   const keywordMatch = buildKeywordQueryFromModels(
//     [
//       { schema: UserReservations.schema }
//     ],
//     keyword
//   );

//   if (Object.keys(keywordMatch).length) {
//     pipeline.push({ $match: keywordMatch });
//   }
// }

//   pipeline.push({ $sort: { createdAt: -1 } });

//   // Apply pagination + counts using $facet
//   pipeline.push({
//     $facet: {
//       data: [
//         { $skip: skip },
//         ...(limit === 0 ? [] : [{ $limit: limit }])
//       ],
//       totalFiltered: [{ $count: "count" }]
//     }
//   });

//   const result = await UserReservations.aggregate(pipeline);

//   let GlobalReferrals = result[0]?.data || [];
//   const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

//   // Additional counts for meta (active/inactive/total by userId as creator)
//   const [total, active, inactive] = await Promise.all([
//     UserReservations.countDocuments({ ...(userId && { userId: userId }), reservationStatus: { $ne: "cancelled" } }),
//     UserReservations.countDocuments({ reservationStatus: "active", ...(userId && { userId: userId }) }),
//     UserReservations.countDocuments({ reservationStatus: "inactive", ...(userId && { userId: userId }) })
//   ]);

//   const meta = generateMeta(page, limit, totalFiltered);
//   meta.reservationsCount = { total, active, inactive };


//   reservations = reservations.map(item => {
//     const formatted = reservationsFormatterAdjustDates(item);
//     if (formatted.conditionType == "noCondition"||formatted.conditionType=="ticketRequirement"||formatted.conditionType=="customText"||formatted.conditionType=="ticketRequirement") {
//       delete formatted.amount;
//       if(formatted.conditionType == "noCondition")
//       {
//       delete formatted.ticketType;
//       }
//     }
//     else{
//             delete formatted.ticketType;
//     }
//     return formatted;
//   });
//   return {reservations , meta}
// }



const findByIdAndUpdate = async (id, data) => {
  return GlobalReferral.findByIdAndUpdate(id, data, { new: true });
};

const findGlobalReferralsById = async (id) => {
  return GlobalReferral.findById(id);
};

module.exports = {
  createGlobalReferral,
  // getReservationsWithFilters,
  // countReservations,
  findGlobalReferralsById,
  // updateReservationData,
  // deleteReservationById,
  // findByIdAndUpdate,
  // getReservations,
  // getUserReservations,
  // findUserReservationById,
  // findUserById,
  getGlobalReferrals,
  findByIdAndUpdate
};