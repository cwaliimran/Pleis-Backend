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
      page,
      limit,
    },
  });
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


const getCounts = async (query) => {
  return getModelCounts({ model: TicketingsModel, filterQuery: query });
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

  // Count occurrences of each ticketId in payload
  const ticketCounts = ticketings.reduce((acc, t) => {
    const key = t.ticketId.toString();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  for (const ticketId of Object.keys(ticketCounts)) {
    const countInPayload = ticketCounts[ticketId];
    const ticket = await TicketingsModel.findById(ticketId);

    if (!ticket) {
      errors.push({ ticketId, message: "Ticket not found" });
      continue;
    }

    // Get total booked for ticket
    const totalBooked = await TicketingBookings.countDocuments({
      "ticket.ticketId": ticketId,
    });

    const remainingGlobalQty = ticket.quantity - totalBooked;

    if (remainingGlobalQty <= 0) {
      errors.push({
        ticketId,
        message: "No tickets available (global limit reached)."
      });
      continue;
    }

    // CASE: Ticket has slots enabled
    if (ticket.timingSlots?.enabled) {
      
      const requestsForTicket = ticketings.filter(
        (t) => t.ticketId.toString() === ticketId
      );

      for (const req of requestsForTicket) {
        const reqSlot = req.timeSlot;

        // CASE A: Slot provided
        if (reqSlot) {
          const allSlots = ticket.timingSlots.dateTimeSlots.flatMap(d =>
            d.timeSlots.map(s => ({
              ...s.toObject(),
              date: d.date
            }))
          );

          const slot = allSlots.find(s => s._id.toString() === reqSlot);

          if (!slot) {
            errors.push({
              ticketId,
              message: `Time slot not found: ${reqSlot}`
            });
            continue;
          }

          const slotBooked = await TicketingBookings.countDocuments({
            "ticket.ticketId": ticketId,
            "ticket.timeSlot": reqSlot,
          });

          const remainingSlotQty = slot.quantity - slotBooked;

          if (remainingSlotQty <= 0) {
            errors.push({
              ticketId,
              message: `No tickets available for this slot`,
            });
            continue;
          }

          // Slot OK → push snapshot
          ticketSnapshots.push({
            ticketId,
            snapshot: ticket.toObject(),
            timeSlot: reqSlot
          });

        } else {
          // CASE B: Slot NOT provided → fallback to global qty check
          if (remainingGlobalQty < countInPayload) {
            errors.push({
              ticketId,
              message: `Not enough tickets available (global)`,
            });
            continue;
          }

          ticketSnapshots.push({
            ticketId,
            snapshot: ticket.toObject(),
            timeSlot: null
          });
        }
      }

      continue;
    }

    // CASE: No time slots → global quantity check
    if (countInPayload > remainingGlobalQty) {
      errors.push({
        ticketId,
        message: `Not enough tickets available`,
        requested: countInPayload,
        available: remainingGlobalQty
      });
      continue;
    }

    // Push snapshot for normal (non-slot) tickets
    for (let i = 0; i < countInPayload; i++) {
      ticketSnapshots.push({
        ticketId,
        snapshot: ticket.toObject(),
        timeSlot: null
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
    })
    .lean(); // optional, gives plain JS object

  if (!ticket) {
    throw new Error("Ticket not found");
  }

  // event may be null if not found
  if (!ticket.event) {
    throw new Error("Event for this ticket not found");
  }
  let organizationId = ticket.event.basicInfo.organization;
  return organizationId;
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
  getOrganizationIdFromTicketId
};
