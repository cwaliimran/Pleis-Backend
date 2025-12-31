// services/reservationservice.js
const { reservationsFormatter, userReservationsFormatter, logQRCode } = require("./formaters/reservationFormetter");
const ReservationRepo = require("./reservationRepository");
const { formatOrganization } = require("../../commonModules/organizations/formatter/formatOrganization");
const moment = require("moment-timezone");
const { isOrganizationOpenNow } = require("../../shared/commonSchemas/operatingHours");

const createReservation = async (data) => {
  let Reservation = await ReservationRepo.createReservation(data);
  return reservationsFormatter(Reservation);
};

// Populate venue data for reservations (updated for new schema)
const getReservations = async ({ timezone, page, limit, keyword, status, userId, eventId, organizationId, date }) => {
  try {
    let { reservations, meta } = await ReservationRepo.getReservations({ timezone, page, limit, keyword, status, userId, eventId, organizationId, date });
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


const updateReservation = async (id, data) => {
  const UserReservation = await ReservationRepo.findUserReservationById(id);

  if (!UserReservation) {
    return { error: "reservation_not_found" };  // Clear error message
  }

  // Allowed fields for update
  const allowedFields = [
    "partySize",
    "reservationType",
    "optionalEventId",
    "organizationId",
    "timingSlots",
    "notes",
  ];

  // Handle timingSlots separately since it's a nested object
  if (data.timingSlots) {
    if (!UserReservation.timingSlots) {
      UserReservation.timingSlots = { enabled: false, dateTimeSlots: [] };  // Default if not present
    }

    if (data.timingSlots.enabled !== undefined) {
      UserReservation.timingSlots.enabled = data.timingSlots.enabled;
    }

    if (Array.isArray(data.timingSlots.dateTimeSlots)) {
      UserReservation.timingSlots.dateTimeSlots = data.timingSlots.dateTimeSlots;
    }
  }

  // Prepare the update data object with the allowed fields
  const updateData = {};
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];  // Only add valid fields
    }
  }

  // If nothing to update, return the original reservation
  if (Object.keys(updateData).length === 0) {
    return UserReservation;  // No update needed
  }

  try {
    // Update the reservation with the new data
    Object.assign(UserReservation, updateData);

    // Save the updated reservation
    await UserReservation.save();

    // Return the formatted reservation
    return reservationsFormatter(UserReservation);
  } catch (error) {

    return { error: "Error updating reservation" };  // Error handling if save fails
  }
};



const deleteReservation = async (id) => {
  const updated = await ReservationRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  return true;
};

const getUserReservations = async ({ timezone, page, limit, keyword, status, userId, date }) => {
  try {

    let { reservations, meta } = await ReservationRepo.getUserReservations({ timezone, page, limit, keyword, status, userId, date });
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




const getReservationDetails = async (id, timezone) => {


  try {
    // Fetch the reservation by id
    let reservation = await ReservationRepo.getReservationDetails(id);

    // Check if the reservation exists
    if (!reservation) {
      console.log("Reservation not found for ID:", id); // Log if reservation is not found
      return { reservation: null };  // Return null for reservation
    }

    // Format the reservation if necessary
    reservation = userReservationsFormatter(reservation, timezone);
    reservation.qrCode = await logQRCode(reservation);

    // Return the reservation object in the response
    return {
      reservation,
    };

  } catch (error) {
    // Log and return a default response in case of an error
    console.error("Error fetching reservation details:", error); // Log the error
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


module.exports = {
  getOrganizationsWithReservationsForHomeService,
  createReservation,
  getReservations,
  updateReservation,
  getUserReservations,
  deleteReservation,
  getReservationDetails,
  getOrganizationReservationsService,
  transferReservation
};