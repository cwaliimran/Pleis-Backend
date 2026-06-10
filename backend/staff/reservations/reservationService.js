// services/reservationservice.js
const { EventCheckins } = require("@EventCheckinsModel");
const { fireAndForget } = require("../../helperUtils/responseUtil");
const { userReservationsFormatter, logQRCode } = require("./formaters/reservationFormetter");
const ReservationRepo = require("./reservationRepository");
const { getActiveEventsForOrg } = require("../../admin/events/eventRepository");
const createReservation = async (data) => {
  let Reservation = await ReservationRepo.createReservation(data);
  return Reservation;
};

const updateReservationStatus = async (id, status) => {
  const updated = await ReservationRepo.findByIdAndUpdate(id, {
    status: status,
  });
  if (!updated) return null;

  if (status === "checkedIn") {
    // Handle checked-in logic if needed
    fireAndForget(
      (async () => {
        const reservation = updated;
        const now = new Date();

        let events = [];

        // 1️⃣ If explicitly linked event exists
        if (reservation.optionalEventId) {
          events = [
            {
              _id: reservation.optionalEventId,
              companyOrganizer: reservation.companyOrganizer,
            },
          ];
        } else {
          // 2️⃣ fallback → find active events
          events = await getActiveEventsForOrg(
            reservation.organizationId,
            now
          );
        }

        if (!events.length) return;

        const userId = reservation.userId;

        if (!userId) return;

        const ops = events.map((event) => ({
          updateOne: {
            filter: {
              event: event._id,
              user: userId,
            },
            update: {
              $setOnInsert: {
                organization: reservation.organizationId,
                companyOrganizer: event.companyOrganizer,
                source: "reservation",
                checkedInAt: now,
              },
            },
            upsert: true,
          },
        }));

        await EventCheckins.bulkWrite(ops, { ordered: false });
      })(),
      "RESERVATION_EVENT_CHECKIN"
    );

  }

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