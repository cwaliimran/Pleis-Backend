const { getWithFilters, getModelCounts } = require("@dbUtils/queryUtil");
const TicketingsModel = require("@TicketingsModel");
const { TicketingBookings } = require("@TicketingBookingsModel");
const { generateMeta } = require("../../helperUtils/responseUtil");
// Create
const { Events } = require("@EventsModel");
const createTicketing = async (data) => {
  const ticketing = new TicketingsModel(data);
  return await ticketing.save();
};
const { getOrganizationIdByCompanyOrganizer } = require("../../admin/organizations/organizationRepository");
// Get all with filters (e.g. filter by eventId)


const getTicketingsWithFilters = async (query, page, limit) => {
  return getWithFilters({
    model: TicketingsModel,
    query,
    populate: [
      {
        path: "event",
        select: "basicInfo.media basicInfo.title basicInfo.organization", // Ensure organization is populated
      },
    ],
    options: {
      page,
      limit,
    },
  });
};

const getTicketings = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  date,
  eventId,
  companyOrganizer,
  organizations,
}) => {
  const skip = (page - 1) * limit; // Pagination calculation
 

  const andConditions = []; // Array to store the conditions for the query

  // Check if organizations are provided; if not, fetch them by companyOrganizer
  if (!organizations) {

    organizations = await getOrganizationIdByCompanyOrganizer(companyOrganizer); // 

    // If organizations are returned as objects, map them to an array of _id
    if (organizations && organizations.length > 0) {
      organizations = organizations.map(org => org._id);
  
    }
  }

  // Step 1: Fetch events that belong to the organizations
  const events = await Events.find({
    "basicInfo.organization": { $in: organizations },
    status: { $ne: "deleted" }, // Optional: Ensure the event is not deleted
  }).select('_id'); // Select only the event _id for the next query



  if (events.length === 0) {
  
    return { ticketings: [], meta: {} }; // Return empty if no events are matched
  }

  const eventIds = events.map(event => event._id); // Extract event IDs

  // Step 2: Filter ticketings based on matched eventIds
  andConditions.push({ event: { $in: eventIds } });

  // Filter by eventId if provided
  if (eventId) {
    andConditions.push({ event: eventId });

  }

  // Filter by date (tickets created on the specified date)
  if (date) {
    andConditions.push({
      createdAt: {
        $gte: new Date(date),
        $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)), // Next day's date
      },
    });
   
  }

  // Filter by status (if not provided, exclude "deleted" status by default)
  if (status) {
    andConditions.push({ status });

  } else {
    andConditions.push({ status: { $ne: "deleted" } });
  
  }

  // Filter by keyword (case-insensitive search in title)
  if (keyword) {
    andConditions.push({
      $or: [{ title: { $regex: keyword, $options: "i" } }], // Case-insensitive regex search
    });
   
  }

  // Construct the query
  const query = andConditions.length ? { $and: andConditions } : {};


  try {

    const [ticketings, counts] = await Promise.all([
      getTicketingsWithFilters(query, page, limit),
      getCounts(query),
    ]);
  

    // Prepare the metadata for pagination
    const { totalFiltered, total, active, inactive } = counts;


    const meta = {
      ...generateMeta(page, limit, totalFiltered),
      ticketingsCount: { total, active, inactive },
    };


    return { ticketings, meta };
  } catch (error) {
    console.error("Error in repository:", error);
    throw error;
  }
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
  getTicketings,
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
