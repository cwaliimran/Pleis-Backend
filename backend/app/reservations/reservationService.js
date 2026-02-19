// services/reservationservice.js
const { reservationsFormatter, userReservationsFormatter, logQRCode } = require("./formaters/reservationFormetter");
const ReservationRepo = require("./reservationRepository");
const { formatOrganization } = require("../../commonModules/organizations/formatter/formatOrganization");
const { isOrganizationOpenNow } = require("../../shared/commonSchemas/operatingHours");

const createReservationService = async (data, session) => {
  if (!session) throw new Error("session_required");


  const result = await ReservationRepo.createReservation(data, session);

  if (!result?.success) {
    return result; // pass business failure upward
  }

  return {
    success: true,
    reservation: reservationsFormatter(result.reservation)
  };
};


// Populate venue data for reservations (updated for new schema)
const getReservations = async ({ timezone, page, limit, keyword, status, userId, eventId, organizationId, date, availability }) => {
  try {
    let { reservations, meta } = await ReservationRepo.getReservations({ timezone, page, limit, keyword, status, userId, eventId, organizationId, date, availability });
    if (!reservations || reservations.length === 0) {
      return { reservations: [], meta };
    }
    reservations = reservations.map(reservation => reservationsFormatter(reservation, timezone));
    return {
      reservations,
      meta
    };
  } catch (error) {
    return {
      reservations: [],
      meta: { totalRecords: 0, currentPage: 1, totalPages: 1, limit: 10 }
    };
  }
};

const getUserReservations = async ({ timezone, page, limit, keyword, userId, date }) => {
  try {

    let { reservations, meta } = await ReservationRepo.getUserReservations({ timezone, page, limit, keyword, userId, date });
    if (!reservations || reservations.length === 0) {
      return { reservations: [], meta };
    }

    reservations = reservations.map(reservation => userReservationsFormatter(reservation, timezone));


    return {
      reservations,
      meta
    };
  } catch (error) {
    return {
      reservations: [],
      meta: { totalRecords: 0, currentPage: 1, totalPages: 1, limit: 10 }
    };
  }
};




const getUserReservationDetailsService = async (id, timezone) => {
  try {
    // Fetch the reservation by id
    let reservation = await ReservationRepo.getUserReservationDetails(id);
    // Check if the reservation exists
    if (!reservation) {

      return { reservation: null };  // Return null for reservation
    }

    // Format the reservation if necessary
    reservation = userReservationsFormatter(reservation, timezone);
    // reservation.qrCode = await logQRCode(reservation);

    // Return the reservation object in the response
    return {
      reservation,
    };

  } catch (error) {

    return {
      reservation: null,
      meta: { totalRecords: 0, currentPage: 1, totalPages: 1, limit: 10 },
    };
  }
};




/**
 * HOME — Organizations with Reservations
 */
const getOrganizationsWithReservationsForHomeService = async ({
  userId,
  userLocation,
  radiusKm = 50,
  timezone,
  category
}) => {
  const organizations =
    await ReservationRepo.getOrganizationsWithReservationsForHome({
      userId,
      userLocation,
      radiusKm,
      timezone,
      limit: 10,
      category
    });

  return organizations.map(org => ({
    ...formatOrganization(org, { timezone, userId }),

    // 🔔 Reservation flags (from repo)
    reservationsAvailable: org.reservationsAvailable ?? false,
    reservationCount: org.reservationCount ?? 0,

    // 🕒 Business hours
    openNow: isOrganizationOpenNow({
      operatingHours: org.operatingHours,
      timezone
    }),

    //remove operatingHours from response
    operatingHours: undefined,

    // 🧠 Explain block (kept for debug / ranking visibility)
    explain: org.explain
  }));
};


const getOrganizationReservationsService = async ({
  organizationId, timezone }) => {
  try {
    let reservations = await ReservationRepo.getOrganizationReservations({
      organizationId,
      timezone
    });
    if (!reservations || reservations.length === 0) {
      return { reservations: [] };
    }
    reservations = reservations.map(reservation => reservationsFormatter(reservation, timezone));
    return reservations;
  } catch (error) {
    return [];  // Return empty array on error
  }
}
const transferReservation = async (reservationId, newUserId, userId) => {
  const reservation = await ReservationRepo.getReservationForTransfer(reservationId);

  if (!reservation) {
    return { success: false, message: "reservation_not_found" };
  }

  // must belong to user AND must not be same user
  if (
    reservation.userId.toString() !== userId.toString() ||
    reservation.userId.toString() === newUserId.toString()
  ) {
    return { success: false, message: "unauthorized_transfer_attempt" };
  }

  // transfer
  reservation.userId = newUserId;

  // ensure array exists
  reservation.transferHistory = reservation.transferHistory || [];

  reservation.transferHistory.push({
    fromUser: userId,
    toUser: newUserId,
    transferDate: new Date(),
  });

  await reservation.save();

  return { success: true, message: "reservation_transferred_successfully" };
};

const acceptReservationChange = async (id, userId) => {
  const reservation =
    await ReservationRepo.findUserReservationById(id);

  const change = reservation.reservationChanges
    .find(c => c.status === "pending");

  if (!change) throw new Error("no_pending_change");

  reservation.timingSlots = change.newTiming;
  change.status = "accepted";

  reservation.reservationChanges.push({
    changedBy: userId,
    action: "accepted",
    status: "completed",
  });

  reservation.status = "confirmed";

  await reservation.save();

  return reservation;
};

const cancelReservation = async (id, userId) => {
  const reservation =
    await ReservationRepo.findUserReservationById(id);

  if (!reservation) {
    throw new Error("Reservation not found");
  }

  // ---- Refund if paid ----
  if (
    reservation.paymentDetails?.paymentStatus === "paid" &&
    reservation.paymentDetails?.paymentId
  ) {
    try {
      //TODO refund payment
      // call refund service
      // await refundViaMonri({
      //   transactionId: reservation.paymentDetails.paymentId,
      //   amount: reservation.amount,
      //   currency: "EUR",
      // });

      // mark refunded
      reservation.paymentDetails.paymentStatus = "refunded";

      reservation.reservationChanges.push({
        changedBy: userId,
        action: "refundProcessed",
        status: "completed",
      });

    } catch (err) {
      console.error("Refund failed:", err);
      throw new Error("Refund failed, cancellation aborted");
    }
  }

  // ---- Cancel reservation ----
  reservation.reservationChanges.push({
    changedBy: userId,
    action: "cancelled",
    status: "completed",
  });

  reservation.status = "cancelled";

  await reservation.save();

  return reservation;
};

const requestRefund = async (id, userId) => {
  const reservation =
    await ReservationRepo.findUserReservationById(id);

  if (reservation.paymentDetails.paymentStatus !== "paid")
    throw new Error("refund_not_allowed");

  reservation.reservationChanges.push({
    changedBy: userId,
    action: "refundRequested",
    status: "pending",
  });

  await reservation.save();
};


module.exports = {
  getOrganizationsWithReservationsForHomeService,
  createReservationService,
  getReservations,
  getUserReservations,
  getUserReservationDetailsService,
  getOrganizationReservationsService,
  transferReservation,
  acceptReservationChange,
  cancelReservation,
  requestRefund
};