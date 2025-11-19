const { generateMeta } = require("@utils/responseUtil");
const ticketingBookingRepo = require("./ticketingBookingRepository");
const { formatTicketingBooking } = require("./formatters/ticketingBookingFormatter");
const { validateTicketsAndQuantity, getOrganizationIdFromTicketId } = require("../../../admin/ticketing/ticketingsRepository");

const createTicketingBookingService = async (data, timezone) => {
  // 1️⃣ Validate tickets + quantities
  const validationResult = await validateTicketsAndQuantity(data.ticketings);

  if (!validationResult.valid) {
    const errorMessages = validationResult.errors
      .map(err => `TicketId: ${err.ticketId} - ${err.message}`)
      .join("; ");
    const error = new Error(`Ticket validation failed: ${errorMessages}`);
    error.validationResult = validationResult;
    throw error;
  }

  //find organizationId from first ticket's event
  const firstTicketId = data.ticketings[0].ticketId;
  const organizationId = await getOrganizationIdFromTicketId(firstTicketId);
  data.organization = organizationId;
  // 2️⃣ Add snapshots from DB to each ticket
  data.ticketings.forEach((t) => {
    const snapshot = validationResult.ticketSnapshots.find(
      ts => ts.ticketId.toString() === t.ticketId
    );
    if (snapshot) {
      t.snapshot = snapshot.snapshot;
      t.timeSlot = t.timeSlot || snapshot.timeSlot || null;
    }
  });


  //TODO add payment processing
  //save in transactions collection

  // 3️⃣ Save booking
  const ticketingBooking = await ticketingBookingRepo.createTicketingBooking(data);
  return ticketingBooking;
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