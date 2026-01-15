// services/reservationservice.js
const { userReservationsFormatter, logQRCode } = require("./formaters/reservationFormetter");
const ReservationRepo = require("./reservationRepository");
const createReservation = async (data) => {
  let Reservation = await ReservationRepo.createReservation(data);
  return Reservation;
};

const updateReservationStatus = async (id, status) => {
  const updated = await ReservationRepo.findByIdAndUpdate(id, {
    reservationStatus: status,
  });
  if (!updated) return null;
  return true;
};

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