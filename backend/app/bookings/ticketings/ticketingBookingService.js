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

  let sumOfPrices = data.ticketings.reduce((sum, t) => {
    // Find the matching snapshot for this ticket
    const snapshot = validationResult.ticketSnapshots.find(
      ts => ts.ticketId.toString() === t.ticketId.toString()
    );
    // Add its price (or 0 if missing)
    return sum + (snapshot?.snapshot.price || 0);
  }, 0);

  // Set tax rate (0 if no tax)
  let taxRate = 0.0; // 0.1 for 10%, etc.

  // Calculate tax amount
  let taxAmount = taxRate > 0 ? parseFloat((sumOfPrices * taxRate).toFixed(2)) : 0.0;

  // Calculate total
  let totalAmount = parseFloat((sumOfPrices + taxAmount).toFixed(2));

  let orderPricing = {
    subtotal: parseFloat(sumOfPrices.toFixed(2)),
    taxAmount,
    total: totalAmount,
    currency: "€",
  };

  const orderDoc = {
    user: data.user,
    organization: organizationId,
    event: eventId,
    status: "confirmed", // directly confirmed as payment is already processed
    purpose: "eventTicketPurchase",
    orderPricing,
    pointsEarned: 120,
    pointsRedeemed: 0,
    ticketsPurchased: data.ticketings.length,
    paymentDetails: data.paymentDetails || {}
  };

  const order = await TicketingOrders.create(orderDoc);

  // 3️⃣ Prepare individual tickets with orderId
  const ticketDocs = data.ticketings.map((t) => {
    const snapshot = validationResult.ticketSnapshots.find(
      ts => ts.ticketId.toString() === t.ticketId.toString()
    );

    // Only include the selected inner timeSlot in snapshot
    let selectedTimeSlot = null;
    if (snapshot.snapshot.timingSlots?.enabled && t.timeSlot) {
      const allTimeSlots = snapshot.snapshot.timingSlots.dateTimeSlots.flatMap(d => d.timeSlots);
      selectedTimeSlot = allTimeSlots.find(s => s._id.toString() === t.timeSlot);
    }

    const snapshotToSave = { ...snapshot.snapshot };
    if (selectedTimeSlot) {
      snapshotToSave.timingSlots = {
        enabled: true,
        selectedSlot: selectedTimeSlot
      };
    } else {
      snapshotToSave.timingSlots = null; // or remove entirely
    }

    return {
      order: order._id,
      user: data.user,
      organization: organizationId,
      ticket: {
        ticketId: t.ticketId,
        snapshot: snapshotToSave,
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



const getTicketingBookingsService = async ({ page = 1, limit = 10, keyword, status = "valid", date, orderSort = "asc", timezone = "UTC", userId }) => {
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