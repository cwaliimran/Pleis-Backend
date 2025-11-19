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

  for (const t of ticketings) {
    const ticket = await TicketingsModel.findById(t.ticketId);

    if (!ticket) {
      errors.push({ ticketId: t.ticketId, message: "Ticket not found" });
      continue;
    }

    let availableQuantity = ticket.quantity;

    // If using timeSlots, deduct already booked quantity for this slot
    if (ticket.timingSlots?.enabled && t.timeSlot) {
      const slot = ticket.timingSlots.dateTimeSlots.find(
        (d) => d._id.toString() === t.timeSlot
      );

      if (!slot) {
        errors.push({ ticketId: t.ticketId, message: "Time slot not found" });
        continue;
      }

      const bookedQty = await TicketingBookings.aggregate([
        { $unwind: "$tickets" },
        { $match: { "tickets.ticketId": ticket._id, "tickets.timeSlot": t.timeSlot } },
        { $group: { _id: null, totalQty: { $sum: "$tickets.quantity" } } }
      ]);

      availableQuantity =
        slot.timeSlots.reduce((sum, s) => sum + s.quantity, 0) -
        (bookedQty[0]?.totalQty || 0);
    } else {
      // Total booked tickets (no time slot)
      const bookedQty = await TicketingBookings.aggregate([
        { $unwind: "$tickets" },
        { $match: { "tickets.ticketId": ticket._id } },
        { $group: { _id: null, totalQty: { $sum: "$tickets.quantity" } } }
      ]);
      availableQuantity = ticket.quantity - (bookedQty[0]?.totalQty || 0);
    }

    if (t.quantity > availableQuantity) {
      errors.push({
        ticketId: t.ticketId,
        requested: t.quantity,
        available: availableQuantity,
        message: "Not enough tickets available",
      });
    } else {
      // Add snapshot
      ticketSnapshots.push({
        ticketId: t.ticketId,
        snapshot: ticket.toObject(), // snapshot of ticket at this moment
        quantity: t.quantity,
        timeSlot: t.timeSlot || null,
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
