// repositories/ReservationRepository.js
const Reservations = require("@ReservationsModel");
const { UserReservations } = require("@UserReservationsModel");
const { User } = require("@UserModel");
const mongoose = require("mongoose");
const { reservationsFormatter } = require("./formaters/reservationFormetter");
const Organizations = require("@OrganizationModel");
const { getUserInterestsIdsForRecommendation } = require("../usersManagement/usersRepository");

const {
  generateMeta,
  convertToUtcDateOnly,
  getCurrentDateInTimezone,
  getStartAndEndOfDay,
  convertTimezoneToUtc,
  getStartAndEndOfMonth,
} = require("../../helperUtils/responseUtil");
const { placePreOrderMenuItemsWithReservation } = require("../menuItemsAndOrdering/orders/orderService");
const { sendUserNotifications } = require("../../controllers/communicationController");
const { NotificationTypes } = require("@NotificationsModel");
const {
  getStaffIdsByOrganization,
  getLogoByOrganization,
} = require("../../admin/organizations/organizationRepository");
const { createTransactionService } = require("../userWalletService/transactions/services/unifiedTransactionsService");
const { TAX_RATE_RESERVATION } = require("../../config/CONSTANTS");
const { usePromoCode } = require("../promoCode/promoCodeRepository");
const ReservationType = require("@ReservationTypeModel");

const moment = require("moment-timezone");
const ReservationPreferences = require("@ReservationPreferencesModel");

const getReservationSlots = async ({ userId, date, organizationId, timezone }) => {
  if (!timezone || !moment.tz.zone(timezone)) {
    return {
      allowed: false,
      message: "Invalid timezone",
      slots: [],
    };
  }

  // --------------------------------------------------
  // 1. Get organization
  // --------------------------------------------------
  const organizationDoc = await Organizations.findOne({
    _id: organizationId,
    status: "active",
  })
    .select("operatingHours")
    .lean();

  if (!organizationDoc) {
    return {
      allowed: false,
      message: "Organization not found or inactive",
      slots: [],
    };
  }

  // --------------------------------------------------
  // 2. Get reservation preferences
  // --------------------------------------------------
  const reservationPreferences = await ReservationPreferences.findOne({
    organizationId,
  })
    .select("timeSlotsSetting")
    .lean();

  const settings = reservationPreferences?.timeSlotsSetting;

  if (!settings || settings.status !== "enabled") {
    return {
      allowed: false,
      message: "Reservation time slots are disabled",
      slots: [],
    };
  }

  const slotDuration = Number(settings.averageSlotDurationInMinutes);

  const bookingOpensAfterMinutes = Number(settings.bookingOpensAfterMinutes || 0);

  const bookingClosesBeforeMinutes = Number(settings.bookingClosesBeforeMinutes || 0);

  if (!slotDuration || slotDuration <= 0) {
    return {
      allowed: false,
      message: "Invalid slot duration",
      slots: [],
    };
  }

  // --------------------------------------------------
  // 3. Parse requested date in USER timezone
  // --------------------------------------------------
  //
  // IMPORTANT:
  // date should be "YYYY-MM-DD"
  //
  // Example:
  // 2026-08-17
  //
  // We intentionally parse it in the user's timezone.
  //
  const userDate = moment.tz(date, "YYYY-MM-DD", timezone);

  if (!userDate.isValid()) {
    return {
      allowed: false,
      message: "Invalid date",
      slots: [],
    };
  }

  const dayName = userDate.format("dddd").toLowerCase();

  // --------------------------------------------------
  // 4. Get operating hours
  // --------------------------------------------------
  const operatingHours = organizationDoc.operatingHours?.[dayName];

  if (!operatingHours?.isOpen) {
    return {
      allowed: true,
      message: "Organization is closed on this day",
      date,
      timezone,
      slots: [],
    };
  }

  const openingMinutes = Number(operatingHours.from);
  const closingMinutes = Number(operatingHours.to);

  if (Number.isNaN(openingMinutes) || Number.isNaN(closingMinutes)) {
    return {
      allowed: false,
      message: "Invalid operating hours",
      slots: [],
    };
  }

  // --------------------------------------------------
  // 5. Effective booking window
  // --------------------------------------------------
  const firstSlotStartMinutes = openingMinutes + bookingOpensAfterMinutes;

  const lastSlotEndMinutes = closingMinutes - bookingClosesBeforeMinutes;

  if (firstSlotStartMinutes >= lastSlotEndMinutes) {
    return {
      allowed: true,
      message: "No reservation slots available",
      date,
      timezone,
      slots: [],
    };
  }

  // --------------------------------------------------
  // 6. Get existing reservations
  // --------------------------------------------------
  const existingReservations = await UserReservations.find({
    organizationId,
    userId,
    status: {
      $in: ["checkedIn", "confirmed", "needsConfirmation", "pendingPayment"],
    },

    // If editing an existing reservation and you want
    // to ignore the user's own reservation:
    //
    // userId: { $ne: userId },

    "timingSlots.dateTimeSlots.date": date,
  })
    .select("timingSlots")
    .lean();

  // --------------------------------------------------
  // 7. Get booked slots
  // --------------------------------------------------
  const bookedSlots = [];

  for (const reservation of existingReservations) {
    for (const dateBlock of reservation.timingSlots?.dateTimeSlots || []) {
      if (dateBlock.date !== date) {
        continue;
      }

      for (const existingSlot of dateBlock.timeSlots || []) {
        const existingStart = moment.parseZone(existingSlot.startTime);

        const existingEnd = moment.parseZone(existingSlot.endTime);

        if (!existingStart.isValid() || !existingEnd.isValid()) {
          continue;
        }

        bookedSlots.push({
          start: existingStart,
          end: existingEnd,
        });
      }
    }
  }

  // --------------------------------------------------
  // 8. Generate slots
  // --------------------------------------------------
  const slots = [];

  for (
    let startMinutes = firstSlotStartMinutes;
    startMinutes + slotDuration <= lastSlotEndMinutes;
    startMinutes += slotDuration
  ) {
    const endMinutes = startMinutes + slotDuration;

    // ------------------------------------------------
    // Operating hours are UTC minutes.
    //
    // So create the operating-hour time in UTC first.
    // ------------------------------------------------
    const utcStart = moment.utc(date, "YYYY-MM-DD").startOf("day").add(startMinutes, "minutes");

    const utcEnd = moment.utc(date, "YYYY-MM-DD").startOf("day").add(endMinutes, "minutes");

    // ------------------------------------------------
    // Convert UTC operating time to user timezone.
    // ------------------------------------------------
    const userStart = utcStart.clone().tz(timezone);
    const userEnd = utcEnd.clone().tz(timezone);

    // ------------------------------------------------
    // Check overlap
    // ------------------------------------------------
    const isBooked = bookedSlots.some(
      (bookedSlot) => userStart.toDate() < bookedSlot.end.toDate() && userEnd.toDate() > bookedSlot.start.toDate(),
    );

    if (!isBooked) {
      slots.push({
        startTime: userStart.toISOString(),
        endTime: userEnd.toISOString(),

        // Optional display values
        startTimeLocal: userStart.format("YYYY-MM-DD HH:mm"),
        endTimeLocal: userEnd.format("YYYY-MM-DD HH:mm"),

        available: true,
      });
    }
  }

  return {
    allowed: true,
    message: "Reservation slots retrieved successfully",
    date,
    timezone,
    slotDuration,
    slots,
  };
};

const checkReservationAvailability = async ({
  reservationTypeId,
  partySize,
  numberOfTables,
  organization,
  timingSlots,
}) => {
  const reservationType = await ReservationType.findOne({
    _id: reservationTypeId,
    organization,
    status: "active",
  }).lean();

  if (!reservationType) {
    return {
      allowed: false,
      message: "Reservation type not found or is inactive",
    };
  }

  // Get only active/pending/accepted reservations
  // for the same organization and reservation type.
  const existingReservations = await UserReservations.find({
    reservationType: String(reservationTypeId),
    organizationId: new mongoose.Types.ObjectId(organization),
    status: {
      $in: ["checkedIn", "confirmed", "needsConfirmation", "pendingPayment"],
    },
  })
    .select("timingSlots numberOfTables partySize")
    .lean();

  // Check every requested date/time slot
  for (const requestedDateBlock of timingSlots?.dateTimeSlots || []) {
    for (const requestedSlot of requestedDateBlock.timeSlots || []) {
      const requestedStart = new Date(requestedSlot.startTime);
      const requestedEnd = new Date(requestedSlot.endTime);

      for (const reservation of existingReservations) {
        for (const existingDateBlock of reservation.timingSlots?.dateTimeSlots || []) {
          for (const existingSlot of existingDateBlock.timeSlots || []) {
            const existingStart = new Date(existingSlot.startTime);
            const existingEnd = new Date(existingSlot.endTime);

            // Check whether the requested slot overlaps
            // with an already booked slot.
            const isOverlapping = requestedStart < existingEnd && requestedEnd > existingStart;

            if (isOverlapping) {
              return {
                allowed: false,
                message: "This reservation type is already booked for the selected time slot",
                conflict: {
                  date: requestedDateBlock.date,
                  requestedStart: requestedSlot.startTime,
                  requestedEnd: requestedSlot.endTime,
                  bookedStart: existingSlot.startTime,
                  bookedEnd: existingSlot.endTime,
                },
              };
            }
          }
        }
      }
    }
  }

  // If there is no time conflict, check table and party capacity.
  const stats = await UserReservations.aggregate([
    {
      $match: {
        reservationType: String(reservationTypeId),
        organizationId: new mongoose.Types.ObjectId(organization),
        status: {
          $in: ["checkedIn", "confirmed", "needsConfirmation", "pendingPayment"],
        },
      },
    },
    {
      $group: {
        _id: null,
        usedTables: { $sum: "$numberOfTables" },
        usedPartySize: { $sum: "$partySize" },
      },
    },
  ]);

  const usedTables = stats[0]?.usedTables || 0;
  const usedPartySize = stats[0]?.usedPartySize || 0;

  const tablesAvailable = usedTables + numberOfTables <= reservationType.numberOfTables;

  const partySizeAvailable = usedPartySize + partySize <= reservationType.maxPartySize;

  if (!tablesAvailable && !partySizeAvailable) {
    return {
      allowed: false,
      message: "Not enough tables or party capacity available for this reservation type",
    };
  }

  if (!tablesAvailable) {
    return {
      allowed: false,
      message: "Not enough tables available for this reservation type",
    };
  }

  if (!partySizeAvailable) {
    return {
      allowed: false,
      message: "Maximum party size for this reservation type has been reached",
    };
  }

  return {
    allowed: true,
    message: "Reservation is available",
  };
};

const createReservation = async (data, session) => {
  if (!session) throw new Error("session_required");

  const {
    userId,
    reservationId,
    partySize,
    preOrderMenuItems,
    timezone,
    firstName,
    lastName,
    phoneNumber,
    promoCode,
    paymentMethod,
    amount,
  } = data;

  /* ---------- Capacity check ---------- */
  if (reservationId) {
    const capacityCheck = await validateReservationCapacity({
      reservationId,
      session,
    });

    if (!capacityCheck.allowed) {
      return { success: false, error: capacityCheck.message };
    }
  }
  /* ---------- Resolve user ---------- */

  let userData;

  if (userId) {
    userData = await User.findById(userId, "firstName lastName phoneNumber", {
      session,
    }).lean();

    if (!userData) throw new Error("User not found");
  } else {
    userData = { firstName, lastName, phoneNumber };
  }

  data.firstName = userData.firstName || "";
  data.lastName = userData.lastName || "";
  data.phoneNumber = userData.phoneNumber || "";

  /* ---------- Reservation base ---------- */
  let baseAmount = Number(data.amount ?? 0);

  if (reservationId) {
    const reservationBase = await Reservations.findById(reservationId).session(session).lean();

    if (!reservationBase) {
      throw new Error("Reservation not found");
    }

    data.reservationSnapshot = reservationBase;
    data.reservationSnapshot = reservationBase;

    baseAmount = Number(reservationBase.amount ?? 0);
  }

  /* ---------- Reservation Pricing ---------- */

  let totalReservationAmount = 0;

  switch (data.conditionType) {
    case "free":
      totalReservationAmount = baseAmount;
      break;
    case "minimumSpend":
      totalReservationAmount = baseAmount;
      data.voucher = {
        status: "pending",
        discountAmount: amount,
      };
      break;
    default:
      totalReservationAmount = 0;
  }

  /* ---------- Reservation Tax ---------- */

  let reservationTax = 0;

  if (totalReservationAmount > 0) {
    reservationTax = totalReservationAmount * TAX_RATE_RESERVATION;
  }

  const reservationTotalWithTax = totalReservationAmount + reservationTax;

  /* ---------- PROMO CODE ---------- */

  let finalReservationAmount = reservationTotalWithTax;
  let promoResult = null;

  if (promoCode && reservationTotalWithTax > 0) {
    promoResult = await usePromoCode(
      {
        promoCode,
        userId,
        companyOrganizer: data.reservationSnapshot.companyOrganizer,
        amount: reservationTotalWithTax,
      },
      session,
    );

    if (promoResult.error) {
      throw new Error(promoResult.error);
    }

    finalReservationAmount = promoResult.finalAmount;
  }

  data.amount = finalReservationAmount;

  /* ---------- Confirmation flow ---------- */

  if (data.conditionType === "noCondition" || data.conditionType === "minimumSpend" || data.conditionType === "free") {
    data.status = "confirmed";
  } else if (data.reservationSnapshot.needsConfirmation) {
    data.status = "needsConfirmation";
  } else if (finalReservationAmount > 0) {
    if (["card", "applePay", "cash"].includes(data?.paymentDetails?.paymentMethod)) {
      data.lockUntil = new Date(Date.now() + 10 * 60 * 1000);

      data.status = "pendingPayment";
    } else {
      throw new Error("Payment method is required");
    }
  } else {
    data.status = "confirmed";
  }

  /* ---------- Save reservation ---------- */

  const userReservation = new UserReservations(data);

  await userReservation.save({ session });

  /* ---------- Pre-order Menu Items ---------- */

  if (preOrderMenuItems?.items?.length) {
    const order = await placePreOrderMenuItemsWithReservation({
      userId,
      timezone,
      items: preOrderMenuItems.items,
      notes: preOrderMenuItems.notes,
      reservation: userReservation._id,
      paymentDetails: data?.paymentDetails,
      session,
    });

    const totalPrice = finalReservationAmount + order.totalPrice;

    userReservation.preOrderMenuItemsOrder = order._id;

    userReservation.amount = totalPrice;

    userReservation.priceBreakDown = {
      reservationAmount: totalReservationAmount,
      reservationTax,
      promoDiscount: promoResult ? promoResult.discount : 0,
      reservationFinalAmount: finalReservationAmount,
      preOrderMenuItemsAmount: order.totalPrice,
      promoCode: promoCode || null,
    };

    await userReservation.save({ session });
  } else {
    userReservation.priceBreakDown = {
      reservationAmount: totalReservationAmount,
      reservationTax,
      promoDiscount: promoResult ? promoResult.discount : 0,
      reservationFinalAmount: finalReservationAmount,
      promoCode: promoCode || null,
    };

    await userReservation.save({ session });
  }

  /* ---------- Loyalty points ---------- */

  if (data.status === "confirmed" && data.reservationSnapshot?.bonusPoints > 0) {
    let companyPoints = {
      base: data.reservationSnapshot.bonusPoints,
      multiplier: 1,
      total: data.reservationSnapshot.bonusPoints,
      pointsPerEuro: 10,
      bonusPoints: data.reservationSnapshot.bonusPoints,
    };

    let globalPoints = {
      base: data.reservationSnapshot.bonusPoints,
      multiplier: 1,
      total: data.reservationSnapshot.bonusPoints,
      pointsPerEuro: 10,
      bonusPoints: data.reservationSnapshot.bonusPoints,
    };

    const trx = await createTransactionService(
      {
        user: userReservation.userId,
        companyOrganizer: userReservation.companyOrganizer,
        organization: userReservation.organizationId,
        companyPoints,
        globalPoints,
        allowNegative: false,
        type: "earn",
        description: "",
        entityId: userReservation._id,
        domainType: "userreservations",
      },
      session,
    );

    if (!trx.success) {
      throw new Error(trx.message || "failed_loyalty_update");
    }
  }

  /* ---------- Notifications ---------- */

  if (userReservation.userId) {
    sendUserNotifications({
      recipientIds: [userReservation.userId.toString()],
      title: "Reservation Created",
      body: `Your reservation has been created successfully.`,
      data: {
        type: NotificationTypes.RESERVATION_UPDATE,
        objectType: "userreservations",
      },
      image: "noimage",
      sender: userId,
      objectId: userReservation.reservationId,
    });
  }

  const staffIds = await getStaffIdsByOrganization(userReservation.organizationId);

  const organizationImage = await getLogoByOrganization(userReservation.organizationId);

  await sendUserNotifications({
    recipientIds: staffIds,
    title: "A New Reservation Created",
    body: `A new reservation has been created successfully.`,
    data: {
      type: NotificationTypes.RESERVATION_UPDATE,
      objectType: "userreservations",
    },
    image: organizationImage,
    sender: userId,
    objectId: userReservation.reservationId,
  });

  return {
    success: true,
    reservation: userReservation,
  };
};

const validateReservationCapacity = async ({ reservationId }) => {
  const now = new Date();
  const reservationObjectId = new mongoose.Types.ObjectId(reservationId);

  // 1️⃣ Fetch reservation definition
  const reservation = await Reservations.findById(reservationObjectId).select("availableReservations");

  if (!reservation) {
    return { valid: false, error: "reservation_not_found" };
  }

  // 2️⃣ Count BLOCKED reservations
  const bookedAgg = await UserReservations.aggregate([
    {
      $match: {
        reservationId: reservationObjectId,
      },
    },
    {
      $match: {
        $or: [
          { status: { $in: ["confirmed", "checkedIn", "completed"] } },
          {
            status: "pendingPayment",
            lockUntil: { $gt: now },
          },
        ],
      },
    },
    {
      $count: "count",
    },
  ]);

  const used = bookedAgg[0]?.count || 0;
  const remaining = reservation.availableReservations - used;

  if (remaining <= 0) {
    return {
      valid: false,
      error: "reservation_capacity_exceeded",
      available: 0,
    };
  }

  return {
    valid: true,
    available: remaining,
  };
};

const getReservationsWithFilters = async (query = {}, skip = 0, limit = 10) => {
  return Reservations.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);
};

// Count by condition
const countReservations = async (query = {}) => {
  return Reservations.countDocuments(query);
};

// Find by ID
const findReservationById = async (id) => {
  return UserReservations.find({ userId: id });
};
const findUserReservationById = async (id) => {
  return UserReservations.findById(id);
};

// Update and save
const updateReservationData = async (Reservation, data) => {
  Object.assign(Reservation, data);
  return await Reservation.save();
};

// Delete
const deleteReservationById = async (Reservation) => {
  return await UserReservations.deleteOne();
};

//findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  return UserReservations.findByIdAndUpdate(id, data, { new: true });
};

const getReservations = async ({
  timezone,
  page = 1,
  limit = 10,
  keyword,
  status,
  userId,
  eventId,
  organizationId,
  date,
  availability,
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const now = new Date();

  /* --------------------------------
     1️⃣ BUILD MATCH
  -------------------------------- */
  const match = { status: "active" };

  if (eventId) match.optionalEventId = new mongoose.Types.ObjectId(eventId);

  if (organizationId) match.organizationId = new mongoose.Types.ObjectId(organizationId);

  /* --------------------------------
     2️⃣ DB PIPELINE (LIGHT)
  -------------------------------- */
  const pipeline = [
    { $match: match },

    /* Capacity enforcement */
    {
      $lookup: {
        from: "userreservations",
        let: { reservationId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$reservationId", "$$reservationId"] },
                  {
                    $or: [
                      {
                        $in: ["$status", ["confirmed", "checkedIn", "completed"]],
                      },
                      {
                        $and: [{ $eq: ["$status", "pendingPayment"] }, { $gt: ["$lockUntil", now] }],
                      },
                    ],
                  },
                ],
              },
            },
          },
          { $count: "count" },
        ],
        as: "blocked",
      },
    },
    {
      $addFields: {
        remainingReservations: {
          $subtract: ["$availableReservations", { $ifNull: [{ $first: "$blocked.count" }, 0] }],
        },
      },
    },
    { $match: { remainingReservations: { $gt: 0 } } },

    { $sort: { createdAt: -1 } },

    {
      $facet: {
        data: [{ $skip: skip }, ...(limit === 0 ? [] : [{ $limit: limit }])],
        totalFiltered: [{ $count: "count" }],
      },
    },
  ];

  const result = await Reservations.aggregate(pipeline);

  let reservations = result[0]?.data || [];

  /* --------------------------------
     3️⃣ SERVER-SIDE SLOT FILTER
  -------------------------------- */

  let start, end;

  if (date) {
    if (availability === "full-month") {
      ({ start, end } = getStartAndEndOfMonth(date, timezone));
    } else {
      ({ start, end } = getStartAndEndOfDay(date, timezone));
    }
  }

  reservations = reservations
    .map((r) => {
      if (!r.timingSlots?.dateTimeSlots) return null;

      const filteredBlocks = r.timingSlots.dateTimeSlots
        .map((block) => {
          const blockDate = new Date(block.date);

          // date filter
          if (date && (blockDate < start || blockDate > end)) return null;

          const timeSlots = (block.timeSlots || []).filter((slot) => new Date(slot.endTime) > now);

          if (!timeSlots.length) return null;

          return { ...block, timeSlots };
        })
        .filter(Boolean);

      if (!filteredBlocks.length) return null;

      r.timingSlots.dateTimeSlots = filteredBlocks;

      return r;
    })
    .filter(Boolean);

  /* --------------------------------
     4️⃣ RETURN SAME FORMAT
  -------------------------------- */
  return {
    reservations,
    meta: generateMeta(page, limit, result[0]?.totalFiltered[0]?.count || 0),
  };
};

const getUserReservations = async ({ timezone, page, limit, userId, date }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  if (date) {
    date = convertToUtcDateOnly(date, "UTC");
  }

  // Querying UserReservations collection directly
  const query = {
    ...(userId && { userId }), // Match userId if provided
    ...(date && {
      // Convert the passed date string to a Date object and ensure the comparison uses Date objects
      "timingSlots.dateTimeSlots.date": {
        $gte: new Date(date), // Start of the day (using the date provided)
        $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)), // End of the day (next day)
      },
    }),
  };

  const pipeline = [
    // Match by userId
    {
      $match: query,
    },
    // Lookup to fetch user details from users table
    {
      $lookup: {
        from: "users", // The users collection
        localField: "userId", // Match userId from UserReservations
        foreignField: "_id", // Match _id in users collection
        as: "user", // Store results in "user" field
      },
    },
    {
      $unwind: {
        path: "$user", // Flatten the user array
        preserveNullAndEmptyArrays: true, // If no user is found, it will be null
      },
    },
    // Lookup to fetch event details using optionalEventId
    {
      $lookup: {
        from: "events", // The events collection
        localField: "optionalEventId", // Match optionalEventId from UserReservations
        foreignField: "_id", // Match _id in events collection
        as: "event", // Store results in "event" field
      },
    },
    {
      $unwind: {
        path: "$event", // Flatten the event array
        preserveNullAndEmptyArrays: true, // If no event is found, it will be null
      },
    },
    // Lookup to fetch organization details using organizationId
    {
      $lookup: {
        from: "organizations", // The organizations collection
        localField: "organizationId", // Match organizationId from UserReservations
        foreignField: "_id", // Match _id in organizations collection
        as: "organization", // Store results in "organization" field
      },
    },
    {
      $unwind: {
        path: "$organization", // Flatten the organization array
        preserveNullAndEmptyArrays: true, // If no organization is found, it will be null
      },
    },
    {
      $lookup: {
        from: "menuorders",
        localField: "preOrderMenuItemsOrder",
        foreignField: "_id",
        as: "preOrderMenuItemsOrder",
      },
    },
    {
      $unwind: {
        path: "$preOrderMenuItemsOrder",
        preserveNullAndEmptyArrays: true,
      },
    },
    // Project necessary fields, including user, event, and organization details
    {
      $project: {
        userId: 1,
        partySize: 1,
        amount: 1,
        timingSlots: 1,
        status: 1,
        createdAt: 1,
        updatedAt: 1,
        organizationId: 1,
        companyOrganizer: 1,
        optionalEventId: 1,
        userName: {
          $concat: ["$user.firstName", " ", "$user.lastName"], // Concatenate firstName and lastName
        },
        profileIcon: "$user.profileIcon", // Fetch profileIcon
        eventTitle: "$event.basicInfo.title", // Fetch event title
        eventImage: "$event.basicInfo.media.name", // Fetch event image URL
        organizationTitle: "$organization.basicInfo.name", // Fetch organization title
        organizationLogo: "$organization.basicInfo.media.logo", // Fetch organization logo
        organizationCover: "$organization.basicInfo.media.cover", // Fetch organization cover image
        preOrderMenuItemsOrder: 1,
        ticketingBookingRefs: 1,
        reservationChanges: 1,
      },
    },
    // Sort by createdAt in descending order
    { $sort: { createdAt: -1 } },

    // Pagination
    {
      $facet: {
        data: [{ $skip: skip }, ...(limit === 0 ? [] : [{ $limit: limit }])],
        totalFiltered: [{ $count: "count" }],
      },
    },
  ];

  // Run the aggregation pipeline
  const result = await UserReservations.aggregate(pipeline);

  const reservations = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Fetch counts for different statuses
  const [total, active, inactive] = await Promise.all([
    UserReservations.countDocuments({ ...query, status: { $ne: "deleted" } }),
    UserReservations.countDocuments({ ...query, status: "active" }),
    UserReservations.countDocuments({ ...query, status: "inactive" }),
  ]);

  // Generate meta information for pagination
  const meta = {
    page,
    limit,
    totalFiltered,
    reservationsCount: { total, active, inactive },
  };

  return { reservations, meta };
};

const getUserReservationDetails = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error("Invalid Reservation ID");
  }

  try {
    const reservationId = new mongoose.Types.ObjectId(id);

    const pipeline = [
      // 1️⃣ Match reservation
      {
        $match: { _id: reservationId },
      },

      // 2️⃣ Lookup unified wallet transactions (entityId = reservation._id)
      {
        $lookup: {
          from: "unifiedwallettransactions",
          let: { reservationId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$entityId", "$$reservationId"] },
              },
            },
            {
              $project: {
                walletType: 1,
                points: "$points.total",
              },
            },
          ],
          as: "transactions",
        },
      },
      //also lookup reservations to get reservationType
      {
        $lookup: {
          from: "reservations",
          localField: "reservationId",
          foreignField: "_id",
          as: "reservationDetails",
        },
      },
      //undwind reservationDetails
      {
        $unwind: {
          path: "$reservationDetails",
          preserveNullAndEmptyArrays: true,
        },
      },

      // 3️⃣ Convert transactions array → object
      {
        $addFields: {
          transactions: {
            $arrayToObject: {
              $map: {
                input: "$transactions",
                as: "tx",
                in: {
                  k: "$$tx.walletType",
                  v: {
                    points: "$$tx.points",
                  },
                },
              },
            },
          },
        },
      },

      // 4️⃣ Convert optionalEventId
      {
        $addFields: {
          optionalEventId: { $toObjectId: "$optionalEventId" },
        },
      },

      // 5️⃣ Lookup Event
      {
        $lookup: {
          from: "events",
          localField: "optionalEventId",
          foreignField: "_id",
          as: "event",
        },
      },
      {
        $unwind: {
          path: "$event",
          preserveNullAndEmptyArrays: true,
        },
      },

      // 6️⃣ Lookup Organization
      {
        $lookup: {
          from: "organizations",
          localField: "organizationId",
          foreignField: "_id",
          as: "organization",
        },
      },
      {
        $unwind: {
          path: "$organization",
          preserveNullAndEmptyArrays: true,
        },
      },

      // 7️⃣ Lookup User
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $unwind: {
          path: "$user",
          preserveNullAndEmptyArrays: true,
        },
      },

      // 8️⃣ Lookup Venue
      {
        $lookup: {
          from: "venues",
          localField: "event.basicInfo.venue",
          foreignField: "_id",
          as: "venue",
        },
      },
      {
        $unwind: {
          path: "$venue",
          preserveNullAndEmptyArrays: true,
        },
      },

      // 9️⃣ Lookup Pre-order Menu Order
      {
        $lookup: {
          from: "menuorders",
          localField: "preOrderMenuItemsOrder",
          foreignField: "_id",
          as: "preOrderMenuItemsOrder",
        },
      },
      {
        $unwind: {
          path: "$preOrderMenuItemsOrder",
          preserveNullAndEmptyArrays: true,
        },
      },

      // 🔟 Final projection
      {
        $project: {
          organizationId: "$organization._id",
          organizationName: "$organization.basicInfo.name",
          organizationLogo: "$organization.basicInfo.media.logo",
          eventName: "$event.basicInfo.title",
          eventStartDate: "$event.schedule.startDateTime",
          userName: { $concat: ["$user.firstName", " ", "$user.lastName"] },
          phoneNumber: "$user.phoneNumber",
          venueFullAddress: "$venue.location.fullAddress",
          reservationType: "$reservationDetails.reservationType",

          transactions: 1, // ✅ included here

          _id: 1,
          userId: 1,
          amount: 1,
          timingSlots: 1,
          needsConfirmation: 1,
          companyOrganizer: 1,
          optionalEventId: 1,
          createdAt: 1,
          updatedAt: 1,
          preOrderMenuItemsOrder: 1,
          ticketingBookingRefs: 1,
          paymentDetails: 1,
          reservationSnapshot: 1,
          reservationChanges: 1,
          userBillingInformation: 1,
          partySize: 1,
          status: 1,
          voucher: 1,
        },
      },

      { $sort: { createdAt: -1 } },
    ];

    const reservation = await UserReservations.aggregate(pipeline);

    return reservation[0] || null;
  } catch (error) {
    throw error;
  }
};

const getOrganizationsWithReservationsForHome = async ({
  userId,
  userLocation,
  radiusKm = 50,
  timezone,
  limit = 10,
  category,
}) => {
  limit = Math.min(limit, 10);
  const radiusMeters = radiusKm * 1000;

  const categoryObjectId = category ? new mongoose.Types.ObjectId(category) : null;

  // user interests
  const prefs = await getUserInterestsIdsForRecommendation(userId);
  const userCategories = prefs?.categories || [];
  const userTags = prefs?.tags || [];

  const baseMatch = {
    status: "active",
    ...(categoryObjectId && {
      "otherInfo.categories": { $in: [categoryObjectId] },
    }),
  };

  const pipeline = [];

  // GEO
  if (userLocation) {
    pipeline.push({
      $geoNear: {
        near: userLocation,
        key: "location",
        distanceField: "distance",
        spherical: true,
        maxDistance: radiusMeters,
        query: baseMatch,
      },
    });
  } else {
    pipeline.push({ $match: baseMatch });
  }

  // RESERVATIONS FILTER
  pipeline.push(
    {
      $lookup: {
        from: "reservations",
        let: { orgId: "$_id", now: new Date() },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$organizationId", "$$orgId"] },
                  { $eq: ["$status", "active"] },
                  { $gt: ["$availableReservations", 0] },
                  { $eq: ["$timingSlots.enabled", true] },
                ],
              },
            },
          },
          { $unwind: "$timingSlots.dateTimeSlots" },
          { $unwind: "$timingSlots.dateTimeSlots.timeSlots" },
          {
            $match: {
              $expr: {
                $and: [
                  {
                    $gt: [
                      "$timingSlots.dateTimeSlots.timeSlots.endTime",
                      "$timingSlots.dateTimeSlots.timeSlots.startTime",
                    ],
                  },
                  {
                    $gt: ["$timingSlots.dateTimeSlots.timeSlots.endTime", "$$now"],
                  },
                ],
              },
            },
          },
          { $count: "count" },
        ],
        as: "reservations",
      },
    },
    {
      $addFields: {
        reservationCount: {
          $ifNull: [{ $first: "$reservations.count" }, 0],
        },
        reservationsAvailable: {
          $gt: [{ $ifNull: [{ $first: "$reservations.count" }, 0] }, 0],
        },
      },
    },
    { $match: { reservationsAvailable: true } },
  );

  // RELEVANCE
  pipeline.push(
    {
      $addFields: {
        matchedCategories: {
          $size: {
            $setIntersection: ["$otherInfo.categories", userCategories],
          },
        },
        matchedTags: {
          $size: {
            $setIntersection: ["$otherInfo.tags", userTags],
          },
        },
      },
    },
    {
      $addFields: {
        relevanceScore: {
          $round: [
            {
              $add: [
                {
                  $multiply: [
                    0.6,
                    userCategories.length
                      ? {
                          $divide: ["$matchedCategories", userCategories.length],
                        }
                      : 0,
                  ],
                },
                {
                  $multiply: [0.4, userTags.length ? { $divide: ["$matchedTags", userTags.length] } : 0],
                },
              ],
            },
            2,
          ],
        },
      },
    },
  );

  // ENGAGEMENT SCORE
  pipeline.push(
    {
      $lookup: {
        from: "engagementevents",
        let: { orgId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [{ $eq: ["$entityType", "organizations"] }, { $eq: ["$entityId", "$$orgId"] }],
              },
            },
          },
          { $count: "count" },
        ],
        as: "engagement",
      },
    },
    {
      $addFields: {
        reviewsCount: {
          $ifNull: [{ $first: "$engagement.count" }, 0],
        },
      },
    },
  );

  // FINAL SCORE
  pipeline.push(
    {
      $addFields: {
        finalScore: {
          $round: [
            {
              $add: [
                {
                  $multiply: [{ $ln: { $add: [1, "$reservationCount"] } }, 0.3],
                },
                { $multiply: [{ $ln: { $add: [1, "$reviewsCount"] } }, 0.3] },
                { $multiply: ["$relevanceScore", 0.4] },
              ],
            },
            2,
          ],
        },
      },
    },
    { $sort: { finalScore: -1 } },
    { $limit: limit },
  );

  /* ----------------------------------
     ➕ TAGS + PRIMARY VENUE (ADDED)
     ---------------------------------- */
  pipeline.push(
    // PRIMARY VENUE
    /* ----------------------------------
   PRIMARY VENUE → VENUE TYPE
---------------------------------- */
    {
      $lookup: {
        from: "venues",
        let: { orgId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$organization", "$$orgId"] },
              isPrimary: true,
              status: "active",
            },
          },
          { $project: { venueType: 1 } },
        ],
        as: "primaryVenue",
      },
    },
    {
      $lookup: {
        from: "venuetypes",
        localField: "primaryVenue.venueType",
        foreignField: "_id",
        as: "venueTypes",
        pipeline: [{ $project: { _id: 1, title: 1 } }],
      },
    },

    // TAGS
    {
      $lookup: {
        from: "tags",
        localField: "otherInfo.tags",
        foreignField: "_id",
        as: "tags",
        pipeline: [{ $project: { _id: 1, title: 1 } }],
      },
    },

    // FINAL SHAPE
    {
      $project: {
        _id: 1,
        distance: userLocation ? 1 : null,

        "basicInfo.name": 1,
        "basicInfo.media": 1,

        operatingHours: 1,

        tags: 1,

        venue: {
          venueType: "$venueTypes",
        },

        reservationsAvailable: 1,
        reservationCount: 1,

        explain: {
          relevanceScore: 1,
          reviewsCount: 1,
          finalScore: 1,
        },
      },
    },
  );

  const results = await Organizations.aggregate(pipeline).allowDiskUse(true);

  return results;
};

const getOrganizationReservations = async ({ organizationId }) => {
  if (!organizationId) return [];

  const orgId = new mongoose.Types.ObjectId(organizationId);
  const now = new Date(); // UTC only

  const results = await Reservations.aggregate([
    // 1️⃣ ORG + ACTIVE
    {
      $match: {
        organizationId: orgId,
        status: "active",
        "timingSlots.enabled": true,
      },
    },

    // 2️⃣ UNWIND
    { $unwind: "$timingSlots.dateTimeSlots" },
    { $unwind: "$timingSlots.dateTimeSlots.timeSlots" },

    // 3️⃣ FUTURE SLOT FILTER
    {
      $match: {
        $expr: {
          $and: [
            {
              $gt: ["$timingSlots.dateTimeSlots.timeSlots.endTime", "$timingSlots.dateTimeSlots.timeSlots.startTime"],
            },
            {
              $gt: ["$timingSlots.dateTimeSlots.timeSlots.endTime", now],
            },
          ],
        },
      },
    },

    // 4️⃣ GROUP BACK (THIS IS THE MISSING PIECE)
    {
      $group: {
        _id: {
          reservationId: "$_id",
          dateBlockId: "$timingSlots.dateTimeSlots._id",
        },
        reservation: { $first: "$$ROOT" },
        timeSlots: {
          $push: "$timingSlots.dateTimeSlots.timeSlots",
        },
      },
    },

    // 5️⃣ REBUILD dateTimeSlots
    {
      $addFields: {
        "reservation.timingSlots.dateTimeSlots": [
          {
            _id: "$_id.dateBlockId",
            date: "$reservation.timingSlots.dateTimeSlots.date",
            timeSlots: "$timeSlots",
          },
        ],
      },
    },

    // 6️⃣ FLATTEN ROOT
    {
      $replaceRoot: {
        newRoot: "$reservation",
      },
    },

    // 7️⃣ FINAL GROUP (ONE DOC PER RESERVATION)
    {
      $group: {
        _id: "$_id",
        doc: { $first: "$$ROOT" },
      },
    },
    {
      $replaceRoot: { newRoot: "$doc" },
    },
  ]);

  return results;
};

const getReservationForTransfer = async (id) => {
  return UserReservations.findById(id).select("_id userId transferHistory");
};

module.exports = {
  createReservation,
  getReservationsWithFilters,
  countReservations,
  findReservationById,
  updateReservationData,
  deleteReservationById,
  findByIdAndUpdate,
  getReservations,
  getUserReservations,
  findUserReservationById,
  getUserReservationDetails,
  getOrganizationsWithReservationsForHome,
  getOrganizationReservations,
  getReservationForTransfer,
  checkReservationAvailability,
  validateReservationCapacity,
  getReservationSlots,
};
