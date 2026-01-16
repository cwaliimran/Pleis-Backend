const { generateMeta } = require("../../helperUtils/responseUtil");
const { getEventIdsByOrganization } = require("../events/eventRepository");
const { formatTicketing, formatEventTicketing } = require("./fomatter/formatTicketing");
const ticketingRepo = require("./ticketingsRepository");
const TicketingsModel = require("@TicketingsModel");

const createTicketing = async (timezone, data) => {

  let ticketing = await ticketingRepo.createTicketing(data);
  if (!ticketing) return null;
  return formatTicketing(timezone, ticketing);
};

const getTicketings = async ({ timezone, page, limit, keyword, status, date, eventId }) => {
  const andConditions = [];

  if (eventId) {
    andConditions.push({ event: eventId });
  }

  if (date) {
    andConditions.push({
      createdAt: {
        $gte: new Date(date),
        $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
      },
    });
  }

  if (status) {
    andConditions.push({ status });
  } else {
    andConditions.push({ status: { $ne: "deleted" } });
  }

  if (keyword) {
    andConditions.push({
      $or: [{ title: { $regex: keyword, $options: "i" } }],
    });
  }

  const query = andConditions.length ? { $and: andConditions } : {};

  const [ticketings, counts] = await Promise.all([
    ticketingRepo.getTicketingsWithFilters(query, page, limit),
    ticketingRepo.getCounts(query),
  ]);

  const formattedTicketings = ticketings.map((item) => formatTicketing(timezone, item));
  const { totalFiltered, total, active, inactive } = counts;

  const meta = {
    ...generateMeta(page, limit, totalFiltered),
    ticketingsCount: { total, active, inactive },
  };

  return { ticketings: formattedTicketings, meta };
};

const getTicketingsByEventId = async ({ timezone, eventId }) => {

  const query = { event: eventId }
  const [ticketings] = await Promise.all([
    ticketingRepo.getTicketingsByEventId(query),
  ]);
  const formattedTicketings = ticketings.map((item) => formatTicketing(timezone, item));

  return { ticketings: formattedTicketings };
};


const getTicketingDetails = async (id, timezone) => {
  const ticketing = await ticketingRepo.findTicketingById(id);
  if (!ticketing) return null;
  return formatTicketing(timezone, ticketing);
};

const updateTicketing = async (id, data, timezone) => {
  const ticketing = await ticketingRepo.findById(id);
  if (!ticketing) return null;

  const {
    title,
    quantity,
    price,
    taxPercentage,
    event,
    timingSlots,
    repeatable,
    resaleProtection,
    transferFee,
    timeSensitivePricing,
    fastTrackEntry,
    requiresReservation,
    status,
    scheduledPublishAt
  } = data;

  // --- BASIC FIELDS ---
  if (title !== undefined) ticketing.title = title.trim();
  if (quantity !== undefined) ticketing.quantity = quantity;
  if (price !== undefined) ticketing.price = price;
  if (taxPercentage !== undefined) ticketing.taxPercentage = taxPercentage;
  if (event !== undefined) ticketing.event = event;
  if (resaleProtection !== undefined) ticketing.resaleProtection = resaleProtection;
  if (transferFee !== undefined) ticketing.transferFee = transferFee;
  if (status !== undefined) ticketing.status = status;
  if (scheduledPublishAt !== undefined) ticketing.scheduledPublishAt = scheduledPublishAt;

  // --- TIMING SLOTS ---
  if (timingSlots) {
    if (!ticketing.timingSlots) ticketing.timingSlots = { enabled: false, dateTimeSlots: [] };

    if (timingSlots.enabled !== undefined)
      ticketing.timingSlots.enabled = timingSlots.enabled;

    if (Array.isArray(timingSlots.dateTimeSlots)) {
      ticketing.timingSlots.dateTimeSlots = timingSlots.dateTimeSlots;
    }
  }

  // --- REPEATABLE ---
  if (repeatable) {
    if (!ticketing.repeatable) ticketing.repeatable = { isRepeatable: false, visits: 1 };

    if (repeatable.isRepeatable !== undefined)
      ticketing.repeatable.isRepeatable = repeatable.isRepeatable;

    if (repeatable.visits !== undefined)
      ticketing.repeatable.visits = repeatable.visits;
  }

  // --- TIME SENSITIVE PRICING ---
  if (timeSensitivePricing) {
    if (!ticketing.timeSensitivePricing)
      ticketing.timeSensitivePricing = { earlyBird: {}, lastMinute: {} };

    const { earlyBird, lastMinute } = timeSensitivePricing;

    if (earlyBird) {
      if (!ticketing.timeSensitivePricing.earlyBird)
        ticketing.timeSensitivePricing.earlyBird = {};
      if (earlyBird.endDate !== undefined)
        ticketing.timeSensitivePricing.earlyBird.endDate = earlyBird.endDate;
      if (earlyBird.discountedPrice !== undefined)
        ticketing.timeSensitivePricing.earlyBird.discountedPrice = earlyBird.discountedPrice;
    }

    if (lastMinute) {
      if (!ticketing.timeSensitivePricing.lastMinute)
        ticketing.timeSensitivePricing.lastMinute = {};
      if (lastMinute.startDate !== undefined)
        ticketing.timeSensitivePricing.lastMinute.startDate = lastMinute.startDate;
      if (lastMinute.discountedPrice !== undefined)
        ticketing.timeSensitivePricing.lastMinute.discountedPrice = lastMinute.discountedPrice;
    }
  }

  // --- FAST TRACK ENTRY ---
  if (fastTrackEntry) {
    if (!ticketing.fastTrackEntry)
      ticketing.fastTrackEntry = { enabled: false, quantity: 0, extraPrice: 0 };

    if (fastTrackEntry.enabled !== undefined)
      ticketing.fastTrackEntry.enabled = fastTrackEntry.enabled;

    if (fastTrackEntry.quantity !== undefined)
      ticketing.fastTrackEntry.quantity = fastTrackEntry.quantity;

    if (fastTrackEntry.extraPrice !== undefined)
      ticketing.fastTrackEntry.extraPrice = fastTrackEntry.extraPrice;
  }

  // --- REQUIRES RESERVATION ---
  if (requiresReservation) {
    if (!ticketing.requiresReservation)
      ticketing.requiresReservation = { enabled: false, type: "any" };

    if (requiresReservation.enabled !== undefined)
      ticketing.requiresReservation.enabled = requiresReservation.enabled;

    if (requiresReservation.type !== undefined)
      ticketing.requiresReservation.type = requiresReservation.type;
  }

  await ticketing.save();
  return formatTicketing(timezone, ticketing);
};


/**
 * deleteTicketing
 *
 * scope:
 *  - single  -> delete only this ticket
 *  - future  -> delete this + all future + template
 */
const deleteTicketing = async (ticketId, scope = "single") => {
  const ticket = await TicketingsModel.findById(ticketId);
  if (!ticket) return null;

  const { recurringMeta } = ticket;

  // ==================================================
  // CASE 1: Not part of recurring series
  // ==================================================
  if (!recurringMeta || (!recurringMeta.isTemplate && !recurringMeta.parentTicket)) {
    await TicketingsModel.updateOne(
      { _id: ticketId },
      { status: "deleted" }
    );
    return { deleted: 1 };
  }

  // ==================================================
  // CASE 2: DELETE ONLY THIS OCCURRENCE
  // ==================================================
  if (scope === "single") {
    await TicketingsModel.updateOne(
      { _id: ticketId },
      { status: "deleted" }
    );
    return { deleted: 1 };
  }

  // ==================================================
  // CASE 3: DELETE THIS + FUTURE OCCURRENCES
  // ==================================================
  const parentTicketId = recurringMeta.parentTicket || ticket._id;
  const occurrenceIndex = recurringMeta.occurrenceIndex;

  const result = await TicketingsModel.updateMany(
    {
      "recurringMeta.parentTicket": parentTicketId,
      "recurringMeta.occurrenceIndex": { $gte: occurrenceIndex },
      status: { $ne: "deleted" },
    },
    { $set: { status: "deleted" } }
  );

  // Also delete template so cron does NOT regenerate
  await TicketingsModel.updateOne(
    { _id: parentTicketId },
    { status: "deleted" }
  );

  return {
    deleted: result.modifiedCount,
    scope: "future",
  };
};


const getOrganizationTicketings = async ({ timezone, page, limit, keyword, status, date, organization }) => {

  const organizationEvents = await getEventIdsByOrganization(organization);
  const eventIds = organizationEvents.map(event => event._id);
  const andConditions = [];
  andConditions.push({ event: { $in: eventIds } });

  if (date) {
    andConditions.push({
      createdAt: {
        $gte: new Date(date),
        $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
      },
    });
  }

  if (status) {
    andConditions.push({ status });
  } else {
    andConditions.push({ status: { $ne: "deleted" } });
  }

  if (keyword) {
    andConditions.push({
      $or: [{ title: { $regex: keyword, $options: "i" } }],
    });
  }

  const query = andConditions.length ? { $and: andConditions } : {};
  const [ticketings, counts] = await Promise.all([
    ticketingRepo.getTicketingsWithFilters(query, page, limit),
    ticketingRepo.getCounts(query),
  ]);
  const formattedTicketings = ticketings.map((item) => formatTicketing(timezone, item));
  const { totalFiltered, total, active, inactive } = counts;

  const meta = {
    ...generateMeta(page, limit, totalFiltered),
    ticketingsCount: { total, active, inactive },
  };
  return { ticketings: formattedTicketings, meta };
};


const EventsgetTicketings = async ({ timezone, eventId }) => {

  const query = { event: eventId, status: { $eq: "active" } };

  let [ticketings] = await Promise.all([
    ticketingRepo.getEventsTicketingsWithFilters(query),
  ]);

  ticketings = ticketings.map((item) => formatEventTicketing(timezone, item));


  return ticketings;
};


const getTicketSalesStatsService = async (eventId, startDate, endDate) => {
  return ticketingRepo.getTicketSalesStats({ eventId, startDate, endDate });
};

module.exports = {
  createTicketing,
  getTicketings,
  getTicketingDetails,
  updateTicketing,
  deleteTicketing,
  getOrganizationTicketings,
  getTicketingsByEventId,
  EventsgetTicketings,
  getTicketSalesStatsService
};
