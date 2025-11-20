const { generateMeta } = require("@utils/responseUtil");
const ticketingBookingRepo = require("./ticketingBookingRepository");
const { formatTicketingBooking } = require("./formatters/ticketingBookingFormatter");
const { validateTicketsAndQuantity, getOrganizationIdFromTicketId } = require("../../../admin/ticketing/ticketingsRepository");
const { TicketingOrders } = require("@TicketingOrdersModel");


const createTicketingBookingService = async (data, timezone) => {
  // 1️⃣ Validate tickets individually
  const validationResult = await validateTicketsAndQuantity(data.ticketings);

  if (!validationResult.valid) {
    const errorMessages = validationResult.errors
      .map(err => `TicketId: ${err.ticketId} - ${err.message}`)
      .join("; ");
    const error = new Error(`Ticket validation failed: ${errorMessages}`);
    error.validationResult = validationResult;
    throw error;
  }

  // 2️⃣ Create Order
  const firstTicketId = data.ticketings[0].ticketId;
  const organizationId = await getOrganizationIdFromTicketId(firstTicketId);
  let eventId = null;
  if (validationResult.ticketSnapshots.length > 0) {
    eventId = validationResult.ticketSnapshots[0].snapshot.event;
  }
  const orderDoc = {
    user: data.user,
    organization: organizationId,
    event: eventId,
    status: "pending",
    orderPricing: data.orderPricing || {},
    paymentDetails: data.paymentDetails || {}
  };

  const order = await TicketingOrders.create(orderDoc);

  // 3️⃣ Prepare individual tickets with orderId
  const ticketDocs = data.ticketings.map((t) => {
    const snapshot = validationResult.ticketSnapshots.find(
      ts => ts.ticketId.toString() === t.ticketId.toString()
    );

    return {
      order: order._id,
      user: data.user,
      organization: organizationId,
      ticket: {
        ticketId: t.ticketId,
        snapshot: snapshot.snapshot,
        timeSlot: t.timeSlot || null,
        protectionUserDetails: t.protectionUserDetails || {},
      },
      status: "valid"
    };
  });

  // 4️⃣ Bulk insert tickets
  const createdTickets = await ticketingBookingRepo.createManyTicketBookings(ticketDocs);

  return { order, tickets: createdTickets };
};



const getTicketingBookingsService = async ({ page = 1, limit = 10, keyword, status = "active", date, orderSort = "asc", timezone = "UTC", userId }) => {
  const query = {};

  // Status filter
  query.status = status ? status : { $ne: "deleted" };
  if (userId) {
    query.user = userId;
  }

  // Date filter (createdAt)
  if (date) {
    query.createdAt = {
      $gte: new Date(date),
      $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
    };
  }

  // Keyword search (name or description)
  if (keyword) {
    query.$or = [
      { name: { $regex: keyword, $options: "i" } },
      { description: { $regex: keyword, $options: "i" } }
    ];
  }

  // Pagination
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  // Sorting (by createdAt)
  const sort = { createdAt: orderSort === "desc" ? -1 : 1 };

  // Fetch ticketingBookings and total count concurrently
  let [ticketingBookings, counts] = await Promise.all([
    ticketingBookingRepo.getTicketingBookings(query, skip, limit === 0 ? 0 : limit, sort),
    ticketingBookingRepo.getTicketingBookingsCount(query)
  ]);

  // Format ticketingBookings
  ticketingBookings = ticketingBookings.map((ticketingBooking) => formatTicketingBooking(ticketingBooking, { timezone }));
  let { pending, confirmed, cancelled, completed, total, totalFiltered } = counts;
  // Meta info
  let meta = generateMeta(page, limit, totalFiltered);
  meta.counts = { pending, confirmed, cancelled, completed, total };

  return { ticketingBookings, meta };
};

const getTicketingBookingByIdService = async (id, timezone) => {
  let ticketingBooking = await ticketingBookingRepo.getTicketingBookingById(id);
  return formatTicketingBooking(ticketingBooking, { timezone });
};

const updateTicketingBookingService = async (id, data, timezone) => {
  let ticketingBooking = await ticketingBookingRepo.updateTicketingBooking(id, data);
  await ticketingBooking.populate('organization user tickets.ticketId').execPopulate();
  return formatTicketingBooking(ticketingBooking, { timezone });
};

const deleteTicketingBookingService = async (id) => {
  return ticketingBookingRepo.findTagByIdAndUpdate(id, { status: "deleted" });
};

module.exports = {
  createTicketingBookingService,
  getTicketingBookingsService,
  getTicketingBookingByIdService,
  updateTicketingBookingService,
  deleteTicketingBookingService,
};