// services/reservationservice.js
const { EventCheckins } = require("@EventCheckinsModel");
const { UserReservations } = require("@UserReservationsModel");
const { fireAndForget } = require("../../helperUtils/responseUtil");
const { userReservationsFormatter, logQRCode } = require("./formaters/reservationFormetter");
const ReservationRepo = require("./reservationRepository");
const {
  changeReservationStatus,
} = require("../../commonModules/reservations/reservationStatusService");
const { getActiveEventsForOrg } = require("../../admin/events/eventRepository");
const {
  maybeSendFreeReservationConfirmation,
} = require("../../helperUtils/plainConfirmationEmailService");
const {
  sendReservationNotification,
  resolveReservationStatusAction,
} = require("../../controllers/notificationHelper/reservationNotificationService");
const createReservation = async (data) => {
  let Reservation = await ReservationRepo.createReservation(data);
  if (Reservation?._id) {
    fireAndForget(
      maybeSendFreeReservationConfirmation(Reservation._id),
      "PLAIN_FREE_RESERVATION_CONFIRMATION",
    );
  }
  return Reservation;
};

// Lifecycle, audit and notifications live in the shared status service (#54, #92, #93).
const updateReservationStatus = async (id, status, { actorId = null, organizationIds = null } = {}) =>
  changeReservationStatus({ id, status, actorId, via: "staff", organizationIds });

const getUserBookingsByDate = async ({ date, status, timezone }) => {
  const bookings = await ReservationRepo.getUserBookingsByDate({
    date,
    status,
  });

  if (!bookings || bookings.length === 0) {
    return [];
  }

  return bookings.map(b =>
    userReservationsFormatter(b, timezone)
  );
};


module.exports = {
  createReservation,
  updateReservationStatus,
  getUserBookingsByDate
};