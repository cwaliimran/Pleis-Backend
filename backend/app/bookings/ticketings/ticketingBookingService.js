const { generateMeta, getCurrentDateInTimezone } = require("@utils/responseUtil");
const ticketingBookingRepo = require("./ticketingBookingRepository");
const { formatTicketingBooking } = require("./formatters/ticketingBookingFormatter");
const {
  validateTicketsAndQuantity,
  getOrganizationIdFromTicketId
} = require("../../../admin/ticketing/ticketingsRepository");
const { TicketingOrders } = require("@TicketingOrdersModel");
const { resolveTimeSensitivePricing } = require("./utils/timeSensitivePricing");
const { Types } = require("mongoose");
const { TAX_RATE_BOOKING } = require("../../../config/CONSTANTS");
const { usePromoCode } = require("../../promoCode/promoCodeRepository");


const createTicketingBookingService = async (
  data,
  timezone,
  session
) => {
  if (!session) {
    throw new Error("session_required");
  }

  /* 1️⃣ Validate tickets */
  const validationResult =
    await validateTicketsAndQuantity(data.ticketings);

  if (!validationResult.valid) {
    const error = new Error(
      validationResult.errors[0]?.message || "ticket_validation_failed"
    );
    error.details = validationResult.errors;
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
  const resolvedTicketData = [];

  for (const t of data.ticketings) {
    const snap = validationResult.ticketSnapshots.find(
      ts => ts.ticketId.toString() === t.ticketId.toString()
    )?.snapshot;

    const resolved =
      resolveTimeSensitivePricing(snap, now);

    let ticketPrice = resolved.basePrice;

    const useFastTrack =
      t.isFastTrack && resolved.fastTrack.available;

    if (useFastTrack) {
      ticketPrice += resolved.fastTrack.extraPrice;
    }

    sumOfPrices += ticketPrice;

    resolvedTicketData.push({
      input: t,
      snapshot: snap,
      pricingPhase: resolved.phase,
      isFastTrack: useFastTrack,
    });
  }

  /* ---------- TAX ---------- */
  let taxAmount = 0;

  if (sumOfPrices > 0) {
    taxAmount = sumOfPrices * TAX_RATE_BOOKING;
  }

  let totalWithTax = sumOfPrices + taxAmount;

  /* ---------- PROMO CODE ---------- */

  let promoResult = null;

  if (data.promoCode) {

    promoResult = await usePromoCode(
      {
        promoCode: data.promoCode,
        userId: data.user,
        companyOrganizer,
        amount: totalWithTax,
      },
      session
    );

    if (promoResult.error) {
      throw new Error(promoResult.error);
    }

    totalWithTax = promoResult.finalAmount;
  }

  /* ---------- ORDER TYPE FLAGS ---------- */

  let isFreeOrder = false;
  if (totalWithTax === 0) {
    isFreeOrder = true;
  }

  const BOOKING_ORDERS_REFS = new Set([
    "rewards",
    "globalrewards",
    "globalchallengeorders",
    "loyaltychallengesorders",
  ]);

  const isRewardOrChallengeBooking =
    BOOKING_ORDERS_REFS.has(data.bookingReference);

  /* ---------- PAYMENT STATE ---------- */

  let paymentMethod = null;
  let cardId = null;
  let transactionId = null;
  let paymentStatus = null;
  let orderStatus = null;

  if (isRewardOrChallengeBooking) {
    paymentMethod = null;
    transactionId = data.bookingReference;
    paymentStatus = "paid";
    orderStatus = "paid";
  } else if (isFreeOrder) {
    paymentMethod = null;
    transactionId = "FREE_ORDER";
    paymentStatus = "paid";
    orderStatus = "paid";
  } else {
    if (!data.paymentDetails) {
      throw new Error("payment_details_required");
    }

    paymentMethod = data.paymentDetails.paymentMethod;
    cardId = data.paymentDetails.cardId || null;
    paymentStatus = "pending";
    orderStatus = "pendingPayment";
  }

  /* ---------- CREATE ORDER ---------- */

  const orderPayload = {
    user: data.user,
    organization: organizationId,
    companyOrganizer,
    event: eventId,
    purpose: "eventTicketPurchase",

    orderPricing: {
      subtotal: sumOfPrices,
      taxAmount,
      discount: promoResult ? promoResult.discount : 0,
      total: totalWithTax,
      currency: "€",
      promoCode: data.promoCode || null,
    },

    ticketsPurchased: data.ticketings.length,

    paymentDetails: {
      paymentMethod,
      cardId,
      transactionId,
      paymentStatus,
    },

    userBillingInformation: data.userBillingInformation || null,

    status: orderStatus,

    bookingReference: data.bookingReference || null,
    meta: data.meta || null,
  };

  /* Lock only payable orders */

  if (!isRewardOrChallengeBooking && !isFreeOrder) {
    orderPayload.lockUntil = new Date(
      Date.now() + 10 * 60 * 1000
    );
  }

  const [order] = await TicketingOrders.create(
    [orderPayload],
    { session }
  );

  /* ---------- Ticket status ---------- */

  let ticketStatus;

  if (isRewardOrChallengeBooking || isFreeOrder) {
    ticketStatus = "valid";
  } else {
    ticketStatus = "pending";
  }

  /* 5️⃣ Create bookings */

  const ticketDocs = resolvedTicketData.map(r => ({
    order: order._id,
    user: data.user,
    organization: organizationId,
    companyOrganizer,

    ticket: {
      ticketId: r.input.ticketId,
      snapshot: {
        ...r.snapshot,
        // Ensure legacy compatibility for fast-track queries
        fastTrack: r.isFastTrack,
      },
      // ⚠️ CRITICAL: Persist the selected time slot so availability queries work
      timeSlot: r.input.timeSlot || null,
      protectionUserDetails:
        r.input.protectionUserDetails || {},
    },

    isFastTrack: r.isFastTrack,
    pricingPhase: r.pricingPhase,
    status: ticketStatus,
  }));

  const tickets =
    await ticketingBookingRepo.createManyTicketBookings(
      ticketDocs,
      session
    );

  return { order, tickets };
};



const getTicketingBookingsService = async ({ page = 1, limit = 10, keyword, status = null, date, orderSort = "asc", timezone = "UTC", userId, companyOrganizer, organization }) => {
  let query = {};
  if (status) {
    query.status = { status: status }
  } else {
    query.status = { $in: ["valid", "used", "cancelled"] }
  }
  if (userId) query.user = userId;

  //for admin
  if (companyOrganizer) {
    query.companyOrganizer = companyOrganizer;
  }

  if (organization) {
    query.organization = organization;
  }

  if (date) {
    query.createdAt = {
      $gte: new Date(date),
      $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
    };
  }


  if (keyword) {
    const regex = new RegExp(keyword, "i");

    const searchableFields = [
      // Booking root fields
      "ticketBookingId",
      "status",
      "pricingPhase",

      // Protection details
      "ticket.protectionUserDetails.firstName",
      "ticket.protectionUserDetails.surName",
      "ticket.protectionUserDetails.pid",

      // Snapshot Ticket fields
      "ticket.snapshot.title",
      "ticket.snapshot.status",
      "ticket.snapshot.resaleProtection",

      // Optional useful fields
      "ticket.snapshot.requiresReservation.type",
    ];

    query.$or = searchableFields.map(field => ({
      [field]: regex
    }));

    // ObjectId safe search
    if (Types.ObjectId.isValid(keyword)) {
      query.$or.push(
        { order: keyword },
        { user: keyword },
        { organization: keyword },
        { "ticket.snapshot.event": keyword },
        { "ticket.snapshot.organization": keyword },
        { "ticket.snapshot.companyOrganizer": keyword }
      );
    }
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

const updateTicketingBookingProtectionDetailsService = async (bookingId, protectionUserDetails, timezone) => {
  const booking = await ticketingBookingRepo.updateTicketingBookingProtectionDetails(bookingId, protectionUserDetails);
  if (!booking) return null;
  return true;
};


module.exports = {
  createTicketingBookingService,
  getTicketingBookingsService,
  getTicketingBookingByIdService,
  updateTicketingBookingService,
  deleteTicketingBookingService,
  transferTicketingBookingService,
  updateTicketingBookingProtectionDetailsService
};
