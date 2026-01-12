const { getWithFilters, getModelCounts } = require("@dbUtils/queryUtil");
const TicketingsModel = require("@TicketingsModel");
const { TicketingBookings } = require("@TicketingBookingsModel");

// Create
const createTicketing = async (data) => {
  const ticketing = new TicketingsModel(data);
  return await ticketing.save();
};

// Get all with filters (e.g. filter by eventId)
const getTicketingsWithFilters = async (query, page, limit) => {
  if (!query.$and) query.$and = [];
  query.$and.push({
    $or: [
        { "recurringMeta.isTemplate": false },
    ]
  });


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
      sort: { createdAt: -1 },
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

  // Group requests by ticketId
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
       → ONLY slot.quantity matters
       → IGNORE ticket.quantity COMPLETELY
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

        const slotBooked = await TicketingBookings.countDocuments({
          "ticket.ticketId": ticketId,
          "ticket.timeSlot": req.timeSlot,
          status: { $in: ["valid", "used"] }
        });

        if (slot.quantity - slotBooked <= 0) {
          errors.push({
            ticketId,
            message: "Selected time slot is sold out"
          });
          continue;
        }

        /* ---------- FAST TRACK (slot tickets allowed) ---------- */
        if (req.isFastTrack === true) {
          if (!ticket.fastTrackEntry?.enabled) {
            errors.push({
              ticketId,
              message: "Fast track not enabled for this ticket"
            });
            continue;
          }

          const fastTrackBooked = await TicketingBookings.countDocuments({
            "ticket.ticketId": ticketId,
            "ticket.snapshot.fastTrack": true,
            status: { $in: ["valid", "used"] }
          });

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

      continue; // ⬅️ CRITICAL: DO NOT FALL THROUGH
    }

    /* =====================================================
       NON-SLOT TICKETS
       → ONLY ticket.quantity matters
    ===================================================== */
    const totalBooked = await TicketingBookings.countDocuments({
      "ticket.ticketId": ticketId,
      status: { $in: ["valid", "used"] }
    });

    const remaining = ticket.quantity - totalBooked;

    if (remaining < requests.length) {
      errors.push({
        ticketId,
        message: "Not enough tickets available",
        available: remaining,
        requested: requests.length
      });
      continue;
    }

    /* ---------- FAST TRACK (non-slot) ---------- */
    const fastTrackRequested = requests.filter(r => r.isFastTrack === true).length;

    if (fastTrackRequested > 0) {
      if (!ticket.fastTrackEntry?.enabled) {
        errors.push({
          ticketId,
          message: "Fast track not enabled for this ticket"
        });
        continue;
      }

      const fastTrackBooked = await TicketingBookings.countDocuments({
        "ticket.ticketId": ticketId,
        "ticket.snapshot.fastTrack": true,
        status: { $in: ["valid", "used"] }
      });

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
      //select: { title: 1, price: 1, status: 1, event: 1},
    },
  });
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
  getEventsTicketingsWithFilters
};
