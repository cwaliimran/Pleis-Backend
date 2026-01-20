const { generateMeta, getCurrentDateInTimezone } = require("@utils/responseUtil");
const ticketingBookingRepo = require("./ticketingBookingRepository");
const { formatTicketingBooking } = require("./formatters/ticketingBookingFormatter");
const {
  validateTicketsAndQuantity,
  getOrganizationIdFromTicketId
} = require("../../../admin/ticketing/ticketingsRepository");
const { TicketingOrders } = require("@TicketingOrdersModel");
const { resolveTimeSensitivePricing } = require("./utils/timeSensitivePricing");


const createTicketingBookingService = async (
  data,
  timezone,
  session
) => {
  if (!session) {
    throw new Error("session_required");
  }

  /* 1️⃣ Validate tickets */
  const validationResult = await validateTicketsAndQuantity(data.ticketings);
  if (!validationResult.valid) {
    const error = new Error("ticket_validation_failed");
    error.details = validationResult.errors; // optional but powerful
    throw error;
  }

  /* 2️⃣ Resolve org / event */
  const firstTicketId = data.ticketings[0].ticketId;
  const { organizationId, companyOrganizer } =
    await getOrganizationIdFromTicketId(firstTicketId);

  const eventId =
    validationResult.ticketSnapshots[0]?.snapshot?.event || null;

  /* 3️⃣ Pricing */
  const now = getCurrentDateInTimezone({ timezone });
  let sumOfPrices = 0;

  for (const t of data.ticketings) {
    const snap = validationResult.ticketSnapshots.find(
      ts => ts.ticketId.toString() === t.ticketId.toString()
    )?.snapshot;

    const resolved = resolveTimeSensitivePricing(snap, now);
    sumOfPrices += resolved.price;
  }

  const isFreeOrder = sumOfPrices === 0;

  /* 4️⃣ Create order */
  const orderPayload = {
    user: data.user,
    organization: organizationId,
    companyOrganizer,
    event: eventId,
    purpose: "eventTicketPurchase",
    orderPricing: {
      subtotal: sumOfPrices,
      taxAmount: 0,
      total: sumOfPrices,
      currency: "€",
    },
    ticketsPurchased: data.ticketings.length,
    paymentDetails: {
      paymentMethod: isFreeOrder ? "cash" : data.paymentDetails.paymentMethod,
      cardId: isFreeOrder ? null : data.paymentDetails.cardId || null,
      paymentId: isFreeOrder ? "FREE_ORDER" : null,
      paymentStatus: isFreeOrder ? "paid" : "pending",
    },
    status: isFreeOrder ? "paid" : "pendingPayment",
    ...(isFreeOrder ? {} : {
      lockUntil: new Date(Date.now() + 10 * 60 * 1000),
    }),
  };

  const [order] = await TicketingOrders.create(
    [orderPayload],
    { session }
  );

  /* 5️⃣ Create bookings */
  const ticketDocs = data.ticketings.map(t => ({
    order: order._id,
    user: data.user,
    organization: organizationId,
    companyOrganizer,
    ticket: {
      ticketId: t.ticketId,
      snapshot: validationResult.ticketSnapshots.find(
        ts => ts.ticketId.toString() === t.ticketId.toString()
      ).snapshot,
      protectionUserDetails: t.protectionUserDetails || {},
    },
    status: isFreeOrder ? "valid" : "pending",
  }));

  const tickets =
    await ticketingBookingRepo.createManyTicketBookings(
      ticketDocs,
      session
    );

  return { order, tickets };
};


const getTicketingBookingsService = async ({ page = 1, limit = 10, keyword, status = "valid", date, orderSort = "asc", timezone = "UTC", userId }) => {
  const query = { status: { $in: ["valid", "used"] } };
  if (userId) query.user = userId;

  if (date) {
    query.createdAt = {
      $gte: new Date(date),
      $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
    };
  }

  if (keyword) {
    query.$or = [
      { name: { $regex: keyword, $options: "i" } },
      { description: { $regex: keyword, $options: "i" } }
    ];
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const sort = { createdAt: orderSort === "desc" ? -1 : 1 };

  let [ticketingBookings, counts] = await Promise.all([
    ticketingBookingRepo.getTicketingBookings(query, skip, limit === 0 ? 0 : limit, sort),
    ticketingBookingRepo.getTicketingBookingsCount(query)
  ]);

  ticketingBookings = ticketingBookings.map(tb =>
    formatTicketingBooking(tb, { timezone })
  );

  const meta = generateMeta(page, limit, counts.totalFiltered);
  meta.counts = counts;

  return { ticketingBookings, meta };
};

const getTicketingBookingByIdService = async (id, timezone) => {
  const booking = await ticketingBookingRepo.getTicketingBookingById(id);
  return formatTicketingBooking(booking, { timezone });
};

const updateTicketingBookingService = async (id, data, timezone) => {
  const booking = await ticketingBookingRepo.updateTicketingBooking(id, data);
  await booking.populate("organization user tickets.ticketId");
  return formatTicketingBooking(booking, { timezone });
};

const deleteTicketingBookingService = async (id) =>
  ticketingBookingRepo.findTagByIdAndUpdate(id, { status: "deleted" });

const transferTicketingBookingService = async (bookingId, newUserId, timezone, userId) => {
  const booking = await ticketingBookingRepo.getTicketingBookingForTransfer(bookingId);
  if (!booking) return { success: false, message: "ticketing_booking_not_found" };

  if (
    booking.user.toString() !== userId.toString() ||
    booking.user.toString() === newUserId.toString()
  ) {
    return { success: false, message: "unauthorized_transfer_attempt" };
  }

  booking.user = newUserId;
  booking.transferHistory.push({
    fromUser: userId,
    toUser: newUserId,
    transferDate: new Date(),
  });

  await booking.save();
  return { success: true, message: "ticketing_booking_transferred_successfully" };
};


module.exports = {
  createTicketingBookingService,
  getTicketingBookingsService,
  getTicketingBookingByIdService,
  updateTicketingBookingService,
  deleteTicketingBookingService,
  transferTicketingBookingService,
};
