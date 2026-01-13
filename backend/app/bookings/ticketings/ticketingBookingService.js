const { generateMeta, getCurrentDateInTimezone } = require("@utils/responseUtil");
const ticketingBookingRepo = require("./ticketingBookingRepository");
const { formatTicketingBooking } = require("./formatters/ticketingBookingFormatter");
const {
  validateTicketsAndQuantity,
  getOrganizationIdFromTicketId
} = require("../../../admin/ticketing/ticketingsRepository");
const { TicketingOrders } = require("@TicketingOrdersModel");
const { calculatePointsRepo } = require("../../loyalty/calculatePointsEarning/pointsEarningsRepository");
const { createTransaction } = require("../../userWalletService/transactions/services/unifiedTransactionsService");
const mongoose = require("mongoose");
const { resolveTimeSensitivePricing } = require("./utils/timeSensitivePricing");


const createTicketingBookingService = async (data, timezone) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    /* 1️⃣ Validate tickets */
    const validationResult = await validateTicketsAndQuantity(data.ticketings);
    if (!validationResult.valid) {
      const errorMessages = validationResult.errors
        .map(err => `TicketId: ${err.ticketId} - ${err.message}`)
        .join("; ");
      throw new Error(`Ticket validation failed: ${errorMessages}`);
    }

    /* 2️⃣ Resolve organization */
    const firstTicketId = data.ticketings[0].ticketId;
    const { organizationId, companyOrganizer } =
      await getOrganizationIdFromTicketId(firstTicketId);

    const eventId =
      validationResult.ticketSnapshots[0]?.snapshot?.event || null;

    /* 3️⃣ Resolve pricing (ONCE, IMMUTABLE) */
    /* 3️⃣ Resolve pricing (ONCE, IMMUTABLE) */
    const now = getCurrentDateInTimezone({ timezone });
    const pricingMap = new Map();

    let sumOfPrices = 0;

    for (const t of data.ticketings) {
      const snapshotInfo = validationResult.ticketSnapshots.find(
        ts => ts.ticketId.toString() === t.ticketId.toString()
      );

      if (!snapshotInfo?.snapshot) {
        throw new Error(`Snapshot missing for ticket ${t.ticketId}`);
      }

      const ticketSnapshot = snapshotInfo.snapshot;

      // 1️⃣ Resolve base / time-sensitive price
      const resolvedPricing = resolveTimeSensitivePricing(ticketSnapshot, now);
      const basePrice = resolvedPricing.price;

      // 2️⃣ Fast track pricing
      let fastTrackExtra = 0;
      if (
        t.isFastTrack === true &&
        ticketSnapshot.fastTrackEntry?.enabled === true
      ) {
        fastTrackExtra = ticketSnapshot.fastTrackEntry.extraPrice || 0;
      }

      const finalUnitPrice = basePrice + fastTrackExtra;

      pricingMap.set(t.ticketId.toString(), {
        phase: resolvedPricing.phase,
        basePrice,
        fastTrackExtra,
        unitPrice: finalUnitPrice,
        isFastTrack: t.isFastTrack === true
      });

      sumOfPrices += finalUnitPrice;
    }

    // const taxRate = 0.0;
    // const taxAmount = taxRate > 0 ? +(sumOfPrices * taxRate).toFixed(2) : 0;
    // const totalAmount = +(sumOfPrices + taxAmount).toFixed(2);
    const totalAmount = sumOfPrices;

    const orderPricing = {
      subtotal: +sumOfPrices.toFixed(2),
      taxAmount: 0,
      total: totalAmount,
      currency: "€",
    };

    /* 4️⃣ Create order */
    const [order] = await TicketingOrders.create([{
      user: data.user,
      organization: organizationId,
      companyOrganizer,
      event: eventId,
      status: "confirmed",
      purpose: "eventTicketPurchase",
      orderPricing,
      ticketsPurchased: data.ticketings.length,
      paymentDetails: data.paymentDetails || {},
    }], { session });

    /* 5️⃣ Create ticket bookings */
    const ticketDocs = data.ticketings.map(t => {
      const snapshotInfo = validationResult.ticketSnapshots.find(
        ts => ts.ticketId.toString() === t.ticketId.toString()
      );

      const pricing = pricingMap.get(t.ticketId.toString());
      let snapshotToSave = { ...snapshotInfo.snapshot };

      snapshotToSave.pricing = {
        phase: pricing.phase,
        basePrice: pricing.basePrice,
        fastTrackExtra: pricing.fastTrackExtra,
        unitPrice: pricing.unitPrice
      };

      snapshotToSave.fastTrack = pricing.isFastTrack;

      if (snapshotToSave?.timingSlots?.enabled && t.timeSlot) {
        const allSlots = snapshotToSave.timingSlots.dateTimeSlots
          .flatMap(d => d.timeSlots);

        const selectedSlot = allSlots.find(
          s => s._id.toString() === t.timeSlot
        );

        snapshotToSave.timingSlots = {
          enabled: true,
          selectedSlot,
        };
      } else {
        snapshotToSave.timingSlots = null;
      }

      return {
        order: order._id,
        user: data.user,
        organization: organizationId,
        companyOrganizer,
        ticket: {
          ticketId: t.ticketId,
          snapshot: snapshotToSave,
          timeSlot: t.timeSlot || null,
          protectionUserDetails: t.protectionUserDetails || {},
        },
        status: "valid",
      };
    });

    const createdTickets =
      await ticketingBookingRepo.createManyTicketBookings(ticketDocs, session);

    /* 6️⃣ Loyalty points */
    if (["applePay", "card"].includes(data.paymentDetails?.paymentMethod)) {
      const pointsCalculation =
        await calculatePointsRepo(data.user, companyOrganizer, totalAmount);

      const globalPoints = {
        base: pointsCalculation.global.earnedPoints,
        multiplier: 1,
        total: pointsCalculation.global.earnedPoints,
        pointsPerEuro: pointsCalculation.global.pointsPerEuro,
      };

      const companyPoints = {
        base: pointsCalculation.organizer.earnedPoints,
        multiplier: 1,
        total: pointsCalculation.organizer.earnedPoints,
        pointsPerEuro: pointsCalculation.organizer.pointsPerEuro,
      };


      const trxData = {
        user: data.user,
        companyOrganizer,
        organization: organizationId,
        companyPoints,
        globalPoints,
        allowNegative: false,
        type: "earn",
        description: "Booked tickets.",
        entityId: order._id,
        domainType: "ticketingorders",
      };

      const trx = await createTransaction(trxData, session);
      if (!trx.success) throw new Error(trx.message || "wallet_update_failed");
    }

    await session.commitTransaction();
    session.endSession();

    return { order, tickets: createdTickets };

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

const getTicketingBookingsService = async ({ page = 1, limit = 10, keyword, status = "valid", date, orderSort = "asc", timezone = "UTC", userId }) => {
  const query = { status };
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
