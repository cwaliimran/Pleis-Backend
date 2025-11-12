const { generateMeta } = require("../../helperUtils/responseUtil");
const { getEventIdsByOrganization } = require("../events/eventRepository");
const { formatTicketing } = require("./fomatter/formatTicketing");
const ticketingRepo = require("./ticketingsRepository");

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


const deleteTicketing = async (id) => {
  const updated = await ticketingRepo.findByIdAndUpdate(id, { status: "deleted" });
  if (!updated) return null;
  return true;
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

module.exports = {
  createTicketing,
  getTicketings,
  getTicketingDetails,
  updateTicketing,
  deleteTicketing,
  getOrganizationTicketings
};
