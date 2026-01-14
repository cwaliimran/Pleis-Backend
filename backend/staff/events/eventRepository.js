// repositories/eventRepository.js
const { Events } = require("@EventsModel");
const TicketingsModel = require("@TicketingsModel");
const { TicketingOrders } = require("../../commonModules/bookings/ticketings/TicketingOrders");
const mongoose = require("mongoose");
const { TicketingBookings } = require("../../commonModules/bookings/ticketings/TicketingBookings");
const { generateMeta } = require("../../helperUtils/responseUtil");
const { getWithFilters, getModelCounts } = require("@dbUtils/queryUtil");

// Get all with filters
const getEventsWithFilters = async (query, skip, limit) => {
  return Events.find(query).select("basicInfo schedule")
    // .populate("basicInfo.venue", "title location floorPlan")
    // .populate("basicInfo.categories", "title image")
    // .populate("basicInfo.tags", "title")
    .populate("basicInfo.organization", "basicInfo.name basicInfo.media otherInfo.description")
    // .populate("basicInfo.partnerOrganization", "basicInfo.name basicInfo.media otherInfo.description")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
};

const getEventsCounts = async (query) => {
  return getModelCounts({ model: Events, filterQuery: query });
}

// Count by condition
const countEvents = async (query = {}) => {
  return Events.countDocuments(query);
};

// Find by ID
const findEventById = async (id) => {
  return Events.findById(id)
    // .populate("basicInfo.venue", "title location floorPlan")
    // .populate("basicInfo.categories", "title image otherInfo")
    // .populate("basicInfo.tags", "title otherInfo")
    .populate({
      path: "basicInfo.organization",
      select: "basicInfo",
    })
  // .populate({
  //   path: "basicInfo.partnerOrganization",
  //   select: "basicInfo.name otherInfo.description basicInfo.media.logo",
  // });
};


const getEventAudienceAnalytics = async (eventId, ticketId = null) => {
  const rows = await TicketingBookings.aggregate([
    {
      $match: {
        "ticket.snapshot.event": new mongoose.Types.ObjectId(eventId),
        ...(ticketId
          ? { "ticket.ticketId": new mongoose.Types.ObjectId(ticketId) }
          : {})
      }
    },

    // join user
    {
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        as: "user"
      }
    },

    { $unwind: "$user" },

    {
      $project: {
        _id: 0,
        gender: "$user.gender",
        dob: "$user.dob"
      }
    }
  ]);

  // -----------------
  // INITIALIZE BUCKETS
  // -----------------

  const genders = {
    Male: 0,
    Female: 0,
    Other: 0,
    Unknown: 0
  };

  const ageBuckets = {
    "18-25": 0,
    "25-35": 0,
    "35-45": 0,
    "45-55": 0,
    "55+": 0
  };

  const now = new Date();

  // -----------------
  // PROCESS ROWS
  // -----------------

  for (const r of rows) {
    //
    // gender
    //
    if (["Male", "Female", "Other"].includes(r.gender)) {
      genders[r.gender]++;
    } else {
      genders.Unknown++;
    }

    //
    // age
    //
    if (!r.dob) continue;

    let age;
    try {
      const dobDate = new Date(r.dob);
      if (!isNaN(dobDate)) {
        age = Math.floor(
          (now - dobDate) / (1000 * 60 * 60 * 24 * 365.25)
        );
      }
    } catch (_) { }

    if (!age || age < 18) continue;

    if (age < 25) ageBuckets["18-25"]++;
    else if (age < 35) ageBuckets["25-35"]++;
    else if (age < 45) ageBuckets["35-45"]++;
    else if (age < 55) ageBuckets["45-55"]++;
    else ageBuckets["55+"]++;
  }

  // -----------------
  // GENDER: COUNTS + %
  // -----------------

  const totalGenderCount =
    genders.Male + genders.Female + genders.Other + genders.Unknown;

  const gender = {
    Male: {
      count: genders.Male,
      percentage:
        totalGenderCount === 0
          ? 0
          : Number(((genders.Male / totalGenderCount) * 100).toFixed(2))
    },
    Female: {
      count: genders.Female,
      percentage:
        totalGenderCount === 0
          ? 0
          : Number(((genders.Female / totalGenderCount) * 100).toFixed(2))
    },
    Other: {
      count: genders.Other,
      percentage:
        totalGenderCount === 0
          ? 0
          : Number(((genders.Other / totalGenderCount) * 100).toFixed(2))
    },
    Unknown: {
      count: genders.Unknown,
      percentage:
        totalGenderCount === 0
          ? 0
          : Number(((genders.Unknown / totalGenderCount) * 100).toFixed(2))
    },
    total: totalGenderCount
  };


  return {
    gender,
    ageRanges: [
      { label: "18-25", value: ageBuckets["18-25"] },
      { label: "25-35", value: ageBuckets["25-35"] },
      { label: "35-45", value: ageBuckets["35-45"] },
      { label: "45-55", value: ageBuckets["45-55"] },
      { label: "55+", value: ageBuckets["55+"] }
    ]
  };
};


const getEventTicketAttendanceAnalytics = async (eventId, ticketId) => {
  const rows = await TicketingBookings.aggregate([
    {
      $match: {
        "ticket.snapshot.event": new mongoose.Types.ObjectId(eventId),
        "ticket.ticketId": ticketId ? new mongoose.Types.ObjectId(ticketId) : { $exists: true }
      }
    },

    {
      $group: {
        _id: "$status",
        count: { $sum: 1 }
      }
    }
  ]);

  let totals = {
    total: 0,
    valid: 0,
    used: 0,
    cancelled: 0,
    attendancePercentage: 0
  };

  for (const r of rows) {
    totals[r._id] = r.count;
    totals.total += r.count;
  }

  const denominator = totals.valid + totals.used;

  totals.attendancePercentage =
    denominator === 0
      ? 0
      : Number(((totals.used / denominator) * 100).toFixed(2));

  return totals;
};


const getEventAttendees = async ({
  eventId,
  keyword = "",
  page,
  limit,
  skip,
}) => {
  const matchStage = {
    "ticket.snapshot.event": new mongoose.Types.ObjectId(eventId)
  };

  const pipelineBase = [
    { $match: matchStage },

    // join user
    {
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        as: "user"
      }
    },

    { $unwind: "$user" },

    // computed helper fields (name + phone variations)
    {
      $addFields: {
        fullName: {
          $trim: {
            input: {
              $concat: [
                { $ifNull: ["$user.firstName", ""] },
                " ",
                { $ifNull: ["$user.lastName", ""] }
              ]
            }
          }
        },

        // "+92 3120000000"
        fullPhone: {
          $trim: {
            input: {
              $concat: [
                { $ifNull: ["$user.phoneNumber.code", ""] },
                " ",
                { $ifNull: ["$user.phoneNumber.number", ""] }
              ]
            }
          }
        },

        // "+923120000000" or "923120000000"
        compactPhone: {
          $replaceAll: {
            input: {
              $concat: [
                { $ifNull: ["$user.phoneNumber.code", ""] },
                { $ifNull: ["$user.phoneNumber.number", ""] }
              ]
            },
            find: " ",
            replacement: ""
          }
        }
      }
    },
    // compute repeatable + remaining visits
    {
      $addFields: {
        isRepeatable: {
          $ifNull: ["$ticket.snapshot.repeatable.isRepeatable", false]
        },
        maxVisits: {
          $ifNull: ["$ticket.snapshot.repeatable.visits", 1]
        },
        usedVisits: {
          $size: { $ifNull: ["$checkInHistory", []] }
        }
      }
    }

  ];

  const keywordStage = [];

  if (keyword && keyword.trim() !== "") {
    const regex = new RegExp(keyword.trim(), "i");

    keywordStage.push({
      $match: {
        $or: [
          { fullName: regex },
          { "user.firstName": regex },
          { "user.lastName": regex },
          { "user.username": regex },
          { "user.email": regex },
          { "user.phoneNumber.number": regex },
          { "user.phoneNumber.code": regex },
          { fullPhone: regex },
          { compactPhone: regex }
        ]
      }
    });
  }

  const projectionStage = [
    {
      $project: {
        _id: 0,
        bookingId: "$ticketBookingId",
        status: 1,
        createdAt: 1,

        user: {
          _id: 1,
          firstName: 1,
          lastName: 1,
          fullName: "$fullName",
          email: 1,
          username: 1,
          gender: 1,
          phoneNumber: 1,
          profileIcon: 1
        },

        ticket: {
          ticketId: "$ticket.ticketId",
          title: "$ticket.snapshot.title",
          price: "$ticket.snapshot.price",
          timeSlot: "$ticket.timeSlot",

          // new fields
          repeatable: "$isRepeatable",
          maxVisits: "$maxVisits",
          usedVisits: "$usedVisits",

          remainingVisits: {
            $cond: [
              "$isRepeatable",
              {
                $cond: [
                  { $lte: ["$usedVisits", "$maxVisits"] },
                  { $subtract: ["$maxVisits", "$usedVisits"] },
                  0
                ]
              },
              {
                // non-repeatable → 1 or 0 based on status
                $cond: [{ $eq: ["$status", "used"] }, 0, 1]
              }
            ]
          }
        }
      }
    }
  ];


  // ---- RUN PAGINATED + TOTAL ----
  const [rows, totalRows] = await Promise.all([
    TicketingBookings.aggregate([
      ...pipelineBase,
      ...keywordStage,
      ...projectionStage,
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit }
    ]),

    TicketingBookings.aggregate([
      ...pipelineBase,
      ...keywordStage,
      { $count: "count" }
    ])
  ]);

  const total = totalRows?.[0]?.count || 0;

  return {
    data: rows,
    meta: generateMeta(page, limit, total)
  };
};

// check in event attendee (by ticketBookingId)
const checkInEventAttendee = async (eventId, ticketBookingId, scannedBy = null) => {

  const attendee = await TicketingBookings.findOne({
    ticketBookingId,
    "ticket.snapshot.event": new mongoose.Types.ObjectId(eventId),
    status: { $ne: "cancelled" }
  });

  if (!attendee)
    return { success: false, error: "ticket_not_found" };

  const repeatable = attendee.ticket?.snapshot?.repeatable?.isRepeatable || false;
  const maxVisits = attendee.ticket?.snapshot?.repeatable?.visits || 1;

  const currentVisits = attendee.checkInHistory?.length || 0;

  // NOT REPEATABLE
  if (!repeatable) {
    if (attendee.status === "used") {
      return { success: false, error: "already_checked_in" };
    }

    attendee.status = "used";

    attendee.checkInHistory.push({
      checkedInAt: new Date(),
      scannedBy
    });

    await attendee.save();
    return { success: true, attendee };
  }

  // REPEATABLE
  if (currentVisits >= maxVisits) {
    return { success: false, error: "max_visits_reached" };
  }

  attendee.checkInHistory.push({
    checkedInAt: new Date(),
    scannedBy
  });

  // mark used when visit limit reached
  if (attendee.checkInHistory.length >= maxVisits) {
    attendee.status = "used";
  }

  await attendee.save();

  return { success: true, attendee };
};


const getTicketingsByEventId = async (eventId, ticketId) => {
  return TicketingsModel.aggregate([
    {
      $match: {
        event: new mongoose.Types.ObjectId(eventId),
        ...(ticketId
          ? { _id: new mongoose.Types.ObjectId(ticketId) }
          : {}),
        status: "active"
      }
    },

    // join bookings for each ticket
    {
      $lookup: {
        from: "ticketingbookings",
        localField: "_id",
        foreignField: "ticket.ticketId",
        as: "bookings"
      }
    },

    // flatten calculations
    {
      $addFields: {
        stats: {
          total: { $size: "$bookings" },

          valid: {
            $size: {
              $filter: {
                input: "$bookings",
                as: "b",
                cond: { $eq: ["$$b.status", "valid"] }
              }
            }
          },

          used: {
            $size: {
              $filter: {
                input: "$bookings",
                as: "b",
                cond: { $eq: ["$$b.status", "used"] }
              }
            }
          },

          cancelled: {
            $size: {
              $filter: {
                input: "$bookings",
                as: "b",
                cond: { $eq: ["$$b.status", "cancelled"] }
              }
            }
          }
        }
      }
    },

    // compute attendance %
    {
      $addFields: {
        "stats.attendancePercentage": {
          $cond: [
            {
              $eq: [
                { $add: ["$stats.valid", "$stats.used"] },
                0
              ]
            },
            0,
            {
              $round: [
                {
                  $multiply: [
                    {
                      $divide: [
                        "$stats.used",
                        { $add: ["$stats.valid", "$stats.used"] }
                      ]
                    },
                    100
                  ]
                },
                2
              ]
            }
          ]
        }
      }
    },

    // clean up bookings to avoid payload bloat
    {
      $project: {
        bookings: 0
      }
    },

    { $sort: { createdAt: -1 } }
  ]);
};


module.exports = {
  getEventsWithFilters,
  countEvents,
  findEventById,
  getEventsCounts,
  getEventAudienceAnalytics,
  getEventTicketAttendanceAnalytics,
  getEventAttendees,
  checkInEventAttendee,
  getTicketingsByEventId
};
