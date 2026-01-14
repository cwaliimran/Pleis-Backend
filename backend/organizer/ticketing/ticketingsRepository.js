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

    const totalBooked = await TicketingBookings.countDocuments({
      "ticket.ticketId": ticketId,
      status: { $in: ["valid", "used"] }
    });

    const remainingGlobalQty = ticket.quantity - totalBooked;

    if (ticket.timingSlots?.enabled) {
      const requestsForTicket = ticketings.filter(
        (t) => t.ticketId.toString() === ticketId
      );

      const allSlots = ticket.timingSlots.dateTimeSlots.flatMap(d =>
        d.timeSlots.map(s => ({
          ...s.toObject(),
          date: d.date,
          slotId: s._id.toString(),
        }))
      );

      for (const req of requestsForTicket) {
        const reqSlot = req.timeSlot;

        if (reqSlot) {
          const slot = allSlots.find(s => s.slotId === reqSlot);

          if (!slot) {
            errors.push({ ticketId, message: `Time slot not found: ${reqSlot}` });
            continue;
          }

          const slotBooked = await TicketingBookings.countDocuments({
            "ticket.ticketId": ticketId,
            "ticket.timeSlot": reqSlot,
            status: { $in: ["valid", "used"] }
          });

          const remainingSlotQty = slot.quantity - slotBooked;

          if (remainingSlotQty <= 0) {
            errors.push({ ticketId, message: `No tickets available for this slot` });
            continue;
          }

          ticketSnapshots.push({
            ticketId,
            snapshot: ticket.toObject(),
            timeSlot: reqSlot,
          });

        } else {
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
            timeSlot: null,
          });
        }
      }

      continue;
    }

    if (remainingGlobalQty <= 0) {
      errors.push({
        ticketId,
        message: "No tickets available (global limit reached).",
      });
      continue;
    }

    if (countInPayload > remainingGlobalQty) {
      errors.push({
        ticketId,
        message: `Not enough tickets available`,
        requested: countInPayload,
        available: remainingGlobalQty,
      });
      continue;
    }

    for (let i = 0; i < countInPayload; i++) {
      ticketSnapshots.push({
        ticketId,
        snapshot: ticket.toObject(),
        timeSlot: null,
      });
    }
  }

  if (errors.length > 0) return { valid: false, errors };

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
