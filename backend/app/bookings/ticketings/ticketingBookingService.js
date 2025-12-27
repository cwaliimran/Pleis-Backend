const { generateMeta } = require("@utils/responseUtil");
const ticketingBookingRepo = require("./ticketingBookingRepository");
const { formatTicketingBooking } = require("./formatters/ticketingBookingFormatter");
const { validateTicketsAndQuantity, getOrganizationIdFromTicketId } = require("../../../admin/ticketing/ticketingsRepository");
const { TicketingOrders } = require("@TicketingOrdersModel");
const { calculatePointsRepo } = require("../../loyalty/calculatePointsEarning/pointsEarningsRepository");
const { createTransaction } = require("../../userWalletService/transactions/services/unifiedTransactionsService");
const mongoose = require("mongoose");

const createTicketingBookingService = async (data, timezone) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1️⃣ Validate tickets
    const validationResult = await validateTicketsAndQuantity(data.ticketings);
    if (!validationResult.valid) {
      const errorMessages = validationResult.errors
        .map(err => `TicketId: ${err.ticketId} - ${err.message}`)
        .join("; ");
      const error = new Error(`Ticket validation failed: ${errorMessages}`);
      error.validationResult = validationResult;
      throw error;
    }

    // 2️⃣ Get ticket organization info
    const firstTicketId = data.ticketings[0].ticketId;
    const { organizationId, companyOrganizer } =
      await getOrganizationIdFromTicketId(firstTicketId);

    let eventId = validationResult.ticketSnapshots[0]?.snapshot?.event || null;

    // 3️⃣ Calculate pricing
    let sumOfPrices = data.ticketings.reduce((sum, t) => {
      const snapshot = validationResult.ticketSnapshots.find(
        ts => ts.ticketId.toString() === t.ticketId.toString()
      );
      return sum + (snapshot?.snapshot.price || 0);
    }, 0);

    const taxRate = 0.0; // Placeholder for dynamic tax if needed
    const taxAmount = taxRate > 0 ? +(sumOfPrices * taxRate).toFixed(2) : 0.0;
    const totalAmount = +(sumOfPrices + taxAmount).toFixed(2);

    const orderPricing = {
      subtotal: +sumOfPrices.toFixed(2),
      taxAmount,
      total: totalAmount,
      currency: "€",
    };

    // 4️⃣ Create order in session
    const orderDoc = {
      user: data.user,
      organization: organizationId,
      companyOrganizer,
      event: eventId,
      status: "confirmed",
      purpose: "eventTicketPurchase",
      orderPricing,
      ticketsPurchased: data.ticketings.length,
      paymentDetails: data.paymentDetails || {},
    };

    const [order] = await TicketingOrders.create([orderDoc], { session });

    // 5️⃣ Prepare individual ticket docs
    const ticketDocs = data.ticketings.map(t => {
      const snapshotInfo = validationResult.ticketSnapshots.find(
        ts => ts.ticketId.toString() === t.ticketId.toString()
      );

      let snapshotToSave = { ...snapshotInfo.snapshot };

      // Select only the chosen time slot
      if (snapshotToSave?.timingSlots?.enabled && t.timeSlot) {
        const allTimeSlots = snapshotToSave.timingSlots.dateTimeSlots
          .flatMap(d => d.timeSlots);
        const selectedSlot = allTimeSlots.find(s => s._id.toString() === t.timeSlot);

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

    // 6️⃣ Insert tickets inside the session
    const createdTickets = await ticketingBookingRepo.createManyTicketBookings(ticketDocs, session);

    // 7️⃣ Loyalty points (if paid online)
    if (
      data.paymentDetails.paymentMethod === "applePay" ||
      data.paymentDetails.paymentMethod === "card"
    ) {
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
        description: "",
        entityId: order._id,
        domainType: "ticketingorders",
      };

      const trx = await createTransaction(trxData, session);
      if (!trx.success) throw new Error(trx.message || "wallet_update_failed");
    }

    // 8️⃣ Commit all operations
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
  let { valid, cancelled, used, total, totalFiltered } = counts;
  // Meta info
  let meta = generateMeta(page, limit, totalFiltered);
  meta.counts = { valid, cancelled, used, total };

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