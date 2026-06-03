const { getWithFilters, getModelCounts } = require("@dbUtils/queryUtil");
const TicketingsModel = require("@TicketingsModel");
const { TicketingBookings } = require("@TicketingBookingsModel");
const { default: mongoose } = require("mongoose");
const { TicketingOrders } = require("@TicketingOrdersModel");
const { formatEventTicketing } = require("../../admin/ticketing/fomatter/formatTicketing");
// Create
const createTicketing = async (data) => {
  const ticketing = new TicketingsModel(data);
  return await ticketing.save();
};

// Get all with filters (e.g. filter by eventId)
// const getTicketingsWithFilters = async (query, page, limit, sortBy, sortOrder) => {
//   if (!query.$and) query.$and = [];
//   query.$and.push({
//     $or: [
//       { "recurringMeta.isTemplate": false },
//     ]
//   });


//   return getWithFilters({
//     model: TicketingsModel,
//     query,
//     populate: [
//       {
//         path: "event",
//         select: "basicInfo.media basicInfo.title",
//       },
//     ],
//     options: {
//       sort: { createdAt: -1 },
//       page,
//       limit,
//     },
//   });
// };
const getTicketingsWithFilters = async (
  query,
  page,
  limit,
  sortBy = "createdAt",
  sortOrder = "desc"
) => {
  if (!query.$and) query.$and = [];

  query.$and.push({
    $or: [{ "recurringMeta.isTemplate": false }],
  });

  const sortDirection = sortOrder === "asc" ? 1 : -1;

  let sort = { createdAt: -1, _id: -1 };

  if (sortBy === "title") {
    sort = { title: sortDirection, _id: -1 };
  } else if (sortBy === "eventTitle") {
    sort = { "event.basicInfo.title": sortDirection, _id: -1 };
  } else if (sortBy === "quantity") {
    sort = { quantity: sortDirection, _id: -1 };
  } else if (sortBy === "price") {
    sort = { price: sortDirection, _id: -1 };
  } else if (sortBy === "taxPercentage") {
    sort = { taxPercentage: sortDirection, _id: -1 };
  } else if (sortBy === "createdAt") {
    sort = { createdAt: sortDirection, _id: sortDirection };
  }

  return getWithFilters({
    model: TicketingsModel,
    query,
    populate: [
      {
        path: "event",
        select: "basicInfo.media basicInfo.title",
      },
    ],
    options: {
      sort,
      page,
      limit,
    },
  });
};


const getCounts = async (query) => {
  return getModelCounts({ model: TicketingsModel, filterQuery: query });
};
// Get all with filters (e.g. filter by eventId)
const getTicketingsByEventId = async (query) => {
  return getWithFilters({
    model: TicketingsModel,
    query,
    populate: [
      {
        path: "event",
        select: "basicInfo.media basicInfo.title",
      },
    ],
  });
};


// Count by condition
const countTicketings = async (query = {}) => {
  return TicketingsModel.countDocuments(query);
};

// Find by ID
const findTicketingById = async (id) => {
  return TicketingsModel.findById(id)
    .select() // select all fields
    .populate({
      path: "event",
      select: "basicInfo.media basicInfo.title", // only select needed event fields
    });
};

// Update and save
const updateTicketingData = async (ticketing, data) => {
  Object.assign(ticketing, data);
  return await ticketing.save();
};

// Delete
const deleteTicketingById = async (ticketing) => {
  return await ticketing.deleteOne();
};

const findById = async (id) => {
  return TicketingsModel.findById(id);
}

// FindByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  return TicketingsModel.findByIdAndUpdate(id, data, { new: true }).populate("event");
};


const validateTicketsAndQuantity = async (ticketings) => {
  const errors = [];
  const ticketSnapshots = [];
  const now = new Date();

  // -----------------------------
  // GROUP REQUESTS BY TICKET ID
  // -----------------------------
  const grouped = {};
  for (const t of ticketings) {
    const key = t.ticketId.toString();
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(t);
  }

  for (const ticketId of Object.keys(grouped)) {
    const requests = grouped[ticketId];
    const ticket = await TicketingsModel.findById(ticketId);

    if (!ticket) {
      errors.push({ ticketId, message: "Ticket not found" });
      continue;
    }

    /* =====================================================
       SLOT-BASED TICKETS
    ===================================================== */
    if (ticket.timingSlots?.enabled === true) {
      for (const req of requests) {
        if (!req.timeSlot) {
          errors.push({
            ticketId,
            message: "Time slot required for this ticket"
          });
          continue;
        }

        const slot = ticket.timingSlots.dateTimeSlots
          .flatMap(d => d.timeSlots)
          .find(s => s._id.toString() === req.timeSlot);

        if (!slot) {
          errors.push({
            ticketId,
            message: "Invalid time slot"
          });
          continue;
        }

        // -----------------------------
        // COUNT BLOCKED SLOT BOOKINGS
        // -----------------------------
        const slotBookedAgg = await TicketingBookings.aggregate([
          {
            $match: {
              "ticket.ticketId": ticket._id,
              "ticket.timeSlot": req.timeSlot
            }
          },
          {
            $lookup: {
              from: "ticketingorders",
              localField: "order",
              foreignField: "_id",
              as: "order"
            }
          },
          { $unwind: "$order" },
          {
            $match: {
              $or: [
                { status: { $in: ["valid", "used"] } },
                {
                  status: "pending",
                  "order.status": "pendingPayment",
                  "order.lockUntil": { $gt: now }
                }
              ]
            }
          },
          { $count: "count" }
        ]);

        const slotBooked = slotBookedAgg[0]?.count || 0;

        if (slot.quantity - slotBooked <= 0) {
          errors.push({
            ticketId,
            message: "Selected time slot is sold out"
          });
          continue;
        }

        /* ---------- FAST TRACK (SLOT) ---------- */
        if (req.isFastTrack === true) {
          if (!ticket.fastTrackEntry?.enabled) {
            errors.push({
              ticketId,
              message: "Fast track not enabled for this ticket"
            });
            continue;
          }

          const fastTrackAgg = await TicketingBookings.aggregate([
            {
              $match: {
                "ticket.ticketId": ticket._id,
                "ticket.snapshot.fastTrack": true
              }
            },
            {
              $lookup: {
                from: "ticketingorders",
                localField: "order",
                foreignField: "_id",
                as: "order"
              }
            },
            { $unwind: "$order" },
            {
              $match: {
                $or: [
                  { status: { $in: ["valid", "used"] } },
                  {
                    status: "pending",
                    "order.status": "pendingPayment",
                    "order.lockUntil": { $gt: now }
                  }
                ]
              }
            },
            { $count: "count" }
          ]);

          const fastTrackBooked = fastTrackAgg[0]?.count || 0;

          if (
            ticket.fastTrackEntry.quantity - fastTrackBooked <= 0
          ) {
            errors.push({
              ticketId,
              message: "Fast track capacity exceeded"
            });
            continue;
          }
        }

        ticketSnapshots.push({
          ticketId,
          snapshot: ticket.toObject(),
          timeSlot: req.timeSlot,
          isFastTrack: req.isFastTrack === true
        });
      }

      continue; // ⬅️ CRITICAL
    }

    /* =====================================================
       NON-SLOT TICKETS
    ===================================================== */
    const totalBookedAgg = await TicketingBookings.aggregate([
      {
        $match: {
          "ticket.ticketId": ticket._id
        }
      },
      {
        $lookup: {
          from: "ticketingorders",
          localField: "order",
          foreignField: "_id",
          as: "order"
        }
      },
      { $unwind: "$order" },
      {
        $match: {
          $or: [
            { status: { $in: ["valid", "used"] } },
            {
              status: "pending",
              "order.status": "pendingPayment",
              "order.lockUntil": { $gt: now }
            }
          ]
        }
      },
      { $count: "count" }
    ]);

    const booked = totalBookedAgg[0]?.count || 0;
    const remaining = ticket.quantity - booked;

    if (remaining < requests.length) {
      errors.push({
        ticketId,
        message: "Not enough tickets available",
        available: remaining,
        requested: requests.length
      });
      continue;
    }

    /* ---------- FAST TRACK (NON-SLOT) ---------- */
    const fastTrackRequested =
      requests.filter(r => r.isFastTrack === true).length;

    if (fastTrackRequested > 0) {
      if (!ticket.fastTrackEntry?.enabled) {
        errors.push({
          ticketId,
          message: "Fast track not enabled for this ticket"
        });
        continue;
      }

      const fastTrackAgg = await TicketingBookings.aggregate([
        {
          $match: {
            "ticket.ticketId": ticket._id,
            "ticket.snapshot.fastTrack": true
          }
        },
        {
          $lookup: {
            from: "ticketingorders",
            localField: "order",
            foreignField: "_id",
            as: "order"
          }
        },
        { $unwind: "$order" },
        {
          $match: {
            $or: [
              { status: { $in: ["valid", "used"] } },
              {
                status: "pending",
                "order.status": "pendingPayment",
                "order.lockUntil": { $gt: now }
              }
            ]
          }
        },
        { $count: "count" }
      ]);

      const fastTrackBooked = fastTrackAgg[0]?.count || 0;

      if (
        ticket.fastTrackEntry.quantity - fastTrackBooked < fastTrackRequested
      ) {
        errors.push({
          ticketId,
          message: "Fast track capacity exceeded"
        });
        continue;
      }
    }

    for (const req of requests) {
      ticketSnapshots.push({
        ticketId,
        snapshot: ticket.toObject(),
        timeSlot: null,
        isFastTrack: req.isFastTrack === true
      });
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, ticketSnapshots };
};



const getOrganizationIdFromTicketId = async (ticketId) => {
  const ticket = await TicketingsModel.findById(ticketId)
    .populate({
      path: "event",
      select: "basicInfo.organization",
      populate: {
        path: "basicInfo.organization",
        select: "creator _id",
      }
    })
    .lean();

  if (!ticket) throw new Error("Ticket not found");
  if (!ticket.event) throw new Error("Event for this ticket not found");

  const organizationId = ticket.event.basicInfo.organization._id;
  const companyOrganizer = ticket.event.basicInfo.organization.creator;

  return { organizationId, companyOrganizer };
};



const getTicketsByOrderIds = async (orderIds) => {
  if (!orderIds.length) return {};

  const tickets = await TicketingBookings.find({
    order: { $in: orderIds }
  })
    .lean()
    .select("-__v");

  // Group tickets by orderId
  const grouped = {};

  tickets.forEach(t => {
    const id = t.order.toString();
    if (!grouped[id]) grouped[id] = [];
    grouped[id].push(t);
  });

  return grouped;
};

const getEventsTicketingsWithFilters = async (query) => {
  return getWithFilters({
    model: TicketingsModel,
    query,
    options: {
      select: { title: 1, price: 1, status: 1, event: 1, timingSlots: 1, fastTrackEntry: 1 },
    },
  });
};



const getEventTotalCapacity = async (eventId) => {
  const tickets = await TicketingsModel.find({
    event: eventId,
    status: "active"
  });
  let total = 0;

  for (const t of tickets) {
    if (t.timingSlots?.enabled) {
      for (const d of t.timingSlots.dateTimeSlots) {
        for (const s of d.timeSlots) {
          total += s.quantity;
        }
      }
    } else {
      total += t.quantity;
    }
  }

  return total;
};


const getPricingSalesStats = async ({ eventId, startDate, endDate }) => {
  const match = {
    "ticket.snapshot.event": new mongoose.Types.ObjectId(eventId)
  };

  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = new Date(startDate);
    if (endDate) match.createdAt.$lte = new Date(endDate);
  }

  const rows = await TicketingBookings.find(match).select(
    "status ticket.snapshot.pricing.unitPrice ticket.snapshot.pricing.phase"
  );

  const phases = ["earlyBird", "lastMinute", "regular"];

  const stats = {};
  phases.forEach(p => {
    stats[p] = {
      valid: { count: 0, amount: 0 },
      used: { count: 0, amount: 0 },
      cancelled: { count: 0, amount: 0 },
      total: { count: 0, amount: 0 }
    };
  });

  let grandCount = 0;
  let grandAmount = 0;

  for (const b of rows) {
    const phase = b.ticket.snapshot.pricing?.phase || "regular";
    const price = b.ticket.snapshot.pricing?.unitPrice || 0;
    const status = b.status;

    // phase must exist
    if (!stats[phase]) continue;

    // 🚀 dynamic status guard (key line)
    if (!stats[phase][status]) continue;

    stats[phase][status].count += 1;
    stats[phase][status].amount += price;

    stats[phase].total.count += 1;
    stats[phase].total.amount += price;

    if (status !== "cancelled") {
      grandCount += 1;
      grandAmount += price;
    }
  }


  return { stats, grandCount, grandAmount };
};

const getTicketSalesStats = async ({
  eventId,
  startDate,
  endDate
}) => {
  const { ticketingStats } =
    await getTicketTypeSalesStats({
      eventId,
      startDate,
      endDate,
    });

  return ticketingStats
};


const getTicketTypeSalesStats = async ({
  eventId,
  startDate,
  endDate,
}) => {
  const eventObjectId = new mongoose.Types.ObjectId(eventId);

  /* ----------------------------------------
     1️⃣ LOAD TICKETS (SOURCE OF TRUTH)
  ---------------------------------------- */
  const tickets = await TicketingsModel.find({
    event: eventObjectId,
    status: { $ne: "deleted" },
  })
    .select(`
      _id title status quantity price transferFee
      timeSensitivePricing fastTrackEntry
    `)
    .lean();

  const ticketMetaMap = {};
  for (const t of tickets) {
    ticketMetaMap[t._id.toString()] = {
      title: t.title,
      status: t.status,
      basePrice: Number(t.price || 0),

      earlyBirdPrice: Number(t.timeSensitivePricing?.earlyBird?.discountedPrice || 0),
      lastMinutePrice: Number(t.timeSensitivePricing?.lastMinute?.discountedPrice || 0),

      fastTrackFee: Number(t.fastTrackEntry?.extraPrice || 0),
      transferFee: Number(t.transferFee || 0),
    };
  }

  /* ----------------------------------------
     2️⃣ CAPACITY MAP
  ---------------------------------------- */
  const capacityMap = await getTicketTypeCapacities(eventId);

  /* ----------------------------------------
     3️⃣ INIT RESULT
  ---------------------------------------- */
  const statsById = {};
  let grandCount = 0;
  let grandAmount = 0;

  for (const [ticketId, meta] of Object.entries(capacityMap)) {
    const tmeta = ticketMetaMap[ticketId] || {};

    statsById[ticketId] = {
      ticketId,
      title: meta.title,

      valid: { count: 0, amount: 0 },
      used: { count: 0, amount: 0 },
      cancelled: { count: 0, amount: 0 },
      total: { count: 0, amount: 0 },

      earlyBird: { count: 0, amount: 0 },
      lastMinute: { count: 0, amount: 0 },
      fastTrack: { count: 0, amount: 0 },
      transfer: { count: 0, amount: 0 },

      totalCreated: meta.totalCreated || 0,
      sold: 0,
      remaining: meta.totalCreated || 0,

      revenue: 0,

      status: tmeta.status || "inactive",
      saleStatus: "onSale",
    };
  }

  /* ----------------------------------------
     4️⃣ BOOKINGS QUERY
  ---------------------------------------- */
  const match = {
    "ticket.snapshot.event": eventObjectId,
  };

  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = new Date(startDate);
    if (endDate) match.createdAt.$lte = new Date(endDate);
  }

  const bookings = await TicketingBookings.find(match)
    .select(`
      status ticket.ticketId
      ticket.snapshot.pricing
      isFastTrack transferHistory pricingPhase
    `)
    .lean();

  /* ----------------------------------------
     5️⃣ PROCESS BOOKINGS
  ---------------------------------------- */
  for (const b of bookings) {
    const ticketId = b.ticket?.ticketId?.toString();
    if (!ticketId || !statsById[ticketId]) continue;

    const bucket = statsById[ticketId];
    const meta = ticketMetaMap[ticketId] || {};
    const pricing = b.ticket?.snapshot?.pricing || {};

    const basePrice = Number(meta.basePrice || 0);

    /* -------------------------
       PHASE LOGIC
    ------------------------- */
    const phase = b.pricingPhase || pricing.phase || "regular";

    let phasePrice = 0;

    if (phase === "earlyBird") phasePrice = meta.earlyBirdPrice;
    if (phase === "lastMinute") phasePrice = meta.lastMinutePrice;

    /* -------------------------
       FAST TRACK
    ------------------------- */
    const fastTrackFee = b.isFastTrack ? meta.fastTrackFee : 0;

    /* -------------------------
       TRANSFER (HISTORY BASED)
    ------------------------- */
    const transferCount = (b.transferHistory?.length || 0);
    const transferFee = transferCount > 0 ? meta.transferFee : 0;

    const finalPrice = basePrice + phasePrice + fastTrackFee + transferFee;

    if (!bucket[b.status]) continue;

    /* -------------------------
       STATUS BUCKETS
    ------------------------- */
    bucket[b.status].count += 1;
    bucket[b.status].amount += finalPrice;

    bucket.total.count += 1;
    bucket.total.amount += finalPrice;

    /* -------------------------
       PHASE BUCKETS
    ------------------------- */
    if (phase === "earlyBird") {
      bucket.earlyBird.count += 1;
      bucket.earlyBird.amount += finalPrice;
    }

    if (phase === "lastMinute") {
      bucket.lastMinute.count += 1;
      bucket.lastMinute.amount += finalPrice;
    }

    /* -------------------------
       FAST TRACK
    ------------------------- */
    if (b.isFastTrack) {
      bucket.fastTrack.count += 1;
      bucket.fastTrack.amount += finalPrice;
    }

    /* -------------------------
       TRANSFER
    ------------------------- */
    if (transferCount > 0) {
      bucket.transfer.count += transferCount;
      bucket.transfer.amount += transferFee;
    }

    bucket.revenue += finalPrice;

    if (b.status !== "cancelled") {
      grandCount += 1;
      grandAmount += finalPrice;
    }
  }

  /* ----------------------------------------
     6️⃣ DERIVED FIELDS
  ---------------------------------------- */
  for (const t of Object.values(statsById)) {
    t.sold = t.total.count;
    t.remaining = Math.max(t.totalCreated - t.sold, 0);
    t.saleStatus = t.remaining > 0 ? "onSale" : "soldOut";
  }

  let slotBasedSales = await getEventSlotSalesBreakdown(eventId);

  return {
    ticketingStats: {
      tickets: Object.values(statsById),
      grandTotal: {
        count: grandCount,
        amount: grandAmount,
      },
      slotBasedSales,
    },
  };
};


const getEventSlotSalesBreakdown = async (eventId) => {
  const eventObjectId = new mongoose.Types.ObjectId(eventId);
  const now = new Date();

  /* =====================================================
     1. LOAD SLOT-BASED TICKETS
  ===================================================== */
  const tickets = await TicketingsModel.find({
    event: eventObjectId,
    status: { $ne: "deleted" },
    "timingSlots.enabled": true,
  }).lean();

  if (!tickets.length) return { eventId, tickets: [] };

  /* =====================================================
     2. LOAD + NORMALIZE BOOKINGS (FIXED SOURCE OF TRUTH)
  ===================================================== */
  const bookings = await TicketingBookings.aggregate([
    {
      $match: {
        "ticket.snapshot.event": eventObjectId,
      },
    },
    {
      $lookup: {
        from: "ticketingorders",
        localField: "order",
        foreignField: "_id",
        as: "order",
      },
    },
    { $unwind: "$order" },
    {
      $match: {
        $or: [
          { status: { $in: ["valid", "used"] } },
          {
            status: "pending",
            "order.status": "pendingPayment",
            "order.lockUntil": { $gt: now },
          },
        ],
      },
    },
    {
      $project: {
        status: 1,
        "ticket.ticketId": 1,
        "ticket.timeSlot": 1,
      },
    },
  ]);

  /* =====================================================
     3. BUILD INDEX MAPS
  ===================================================== */
  const soldMap = new Map();     // valid + used
  const scannedMap = new Map();  // used only

  const isSold = (b) => ["valid", "used"].includes(b.status);
  const isScanned = (b) => b.status === "used";

  for (const b of bookings) {
    const ticketId = b.ticket?.ticketId?.toString();
    const slotId = b.ticket?.timeSlot?.toString();

    if (!ticketId || !slotId) continue;

    const key = `${ticketId}_${slotId}`;

    if (isSold(b)) {
      soldMap.set(key, (soldMap.get(key) || 0) + 1);
    }

    if (isScanned(b)) {
      scannedMap.set(key, (scannedMap.get(key) || 0) + 1);
    }
  }

  /* =====================================================
     4. BUILD RESPONSE (NOW CONSISTENT WITH TICKET STATS)
  ===================================================== */
  const result = tickets.map((ticket) => {
    const ticketId = ticket._id.toString();

    let ticketSold = 0;
    let ticketScanned = 0;
    let ticketCapacity = 0;

    const slots = (ticket.timingSlots.dateTimeSlots || []).map((day) => {
      const date = day.date;

      const timeSlots = (day.timeSlots || []).map((slot) => {
        const slotId = slot._id.toString();
        const key = `${ticketId}_${slotId}`;

        const quantity = slot.quantity || 0;

        const sold = soldMap.get(key) || 0;
        const scanned = scannedMap.get(key) || 0;

        const remaining = Math.max(quantity - sold, 0);

        ticketSold += sold;
        ticketScanned += scanned;
        ticketCapacity += quantity;

        return {
          date,
          timeSlotId: slotId,
          startTime: slot.startTime,
          endTime: slot.endTime,
          quantity,
          sold,
          scanned,
          remaining,
        };
      });

      return {
        date,
        timeSlots,
      };
    });

    return {
      ticketId,
      title: ticket.title,

      totalCreated: ticketCapacity,

      sold: ticketSold,
      scanned: ticketScanned,

      remaining: Math.max(ticketCapacity - ticketSold, 0),

      slots,
    };
  });

  return {
    eventId,
    tickets: result,
  };
};


const getTicketTypeCapacities = async (eventId) => {
  const tickets = await TicketingsModel.find({
    event: eventId,
    status: { $ne: "deleted" },
  }).lean();

  const capacityMap = {};

  for (const t of tickets) {
    let total = 0;

    if (t.timingSlots?.enabled) {
      for (const d of t.timingSlots.dateTimeSlots || []) {
        for (const s of d.timeSlots || []) {
          total += s.quantity || 0;
        }
      }
    } else {
      total = t.quantity || 0;
    }

    capacityMap[t._id.toString()] = {
      title: t.title,
      totalCreated: total,
    };
  }

  return capacityMap;
};


const getTotalTicketsPurchasedByOrganizationId = async (organizationId) => {
  try {
    // Ensure the organizationId is converted to ObjectId if it's a string
    const objectId = new mongoose.Types.ObjectId(organizationId);

    // Aggregate the total number of tickets purchased for the given organizationId
    const result = await TicketingOrders.aggregate([
      { $match: { organization: objectId, purpose: "eventTicketPurchase" } }, // Filter by organization and ticket purchase purpose
      { $group: { _id: null, totalTickets: { $sum: "$ticketsPurchased" } } } // Sum the ticketsPurchased field
    ]);

    // If no results found, return 0, else return the total tickets
    return result.length > 0 ? result[0].totalTickets : 0;
  } catch (error) {

    return 0; // Return 0 if there was an error
  }
};
const getTotalPurchases = async (userId) => {
  try {
    // Fetch all orders for the user and sum the total from each order
    const result = await TicketingOrders.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId), // Match by userId
          status: "paid",  // Optionally, you can filter by status like 'paid'
        }
      },
      {
        $group: {
          _id: null,  // Group by nothing to get a single result
          totalPurchases: { $sum: "$orderPricing.total" }  // Sum up the total from each order
        }
      }
    ]);
    // If result is empty, return 0
    return result.length > 0 ? result[0].totalPurchases : 0;
  } catch (error) {

    throw error;
  }
};
const getActiveTicketingByEventId = async ({
  event,
  page = 1,
  limit = 10,
  status = "active",
  keyword = "",
  timezone
}) => {

  try {
    // Skip value for pagination
    const skip = (page - 1) * limit;

    // Build the filter object
    let filter = {
      event: new mongoose.Types.ObjectId(event), // Convert eventId to ObjectId
      status: status // Filter by status, default to "active"
    };

    // If keyword is provided, filter by title (case-insensitive)
    if (keyword) {
      filter.title = { $regex: keyword, $options: 'i' }; // Case-insensitive search
    }

    // Query for ticketings with pagination and filters
    let ticketings = await TicketingsModel.find(filter)
      .skip(skip)
      .limit(limit)
    ticketings = ticketings.map((item) => formatEventTicketing(timezone, item));

    return ticketings;
  } catch (error) {
    throw new Error("Unable to fetch active ticketings.");
  }
};
module.exports = {
  createTicketing,
  getTicketingsWithFilters,
  countTicketings,
  findTicketingById,
  updateTicketingData,
  deleteTicketingById,
  findByIdAndUpdate,
  getCounts,
  findById,
  getTicketingsByEventId,
  validateTicketsAndQuantity,
  getOrganizationIdFromTicketId,
  getTicketsByOrderIds,
  getEventsTicketingsWithFilters,
  getTicketSalesStats,
  getTotalTicketsPurchasedByOrganizationId,
  getTotalPurchases,
  getActiveTicketingByEventId
};
