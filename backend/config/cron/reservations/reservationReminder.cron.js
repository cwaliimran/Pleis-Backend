// crons/reservations/reservationReminder.cron.js

const { UserReservations } = require("@UserReservationsModel");
const ReservationNotificationLogsModel = require("@ReservationNotificationLogsModel");
const { sendReservationNotification } =  require("../../../controllers/notificationHelper/reservationNotificationService");

const MINUTE_MS = 60 * 1000;

const runReservationReminderCron = async () => {
  const now = new Date();

  const windowStart = new Date(now.getTime() - MINUTE_MS);
  const windowEnd = new Date(now.getTime() + MINUTE_MS);

  try {
    await processReminder(
      "RESERVATION_REMINDER_24H",
      24 * 60 * 60 * 1000,
      windowStart,
      windowEnd
    );

    await processReminder(
      "RESERVATION_REMINDER_2H",
      2 * 60 * 60 * 1000,
      windowStart,
      windowEnd
    );

  } catch (err) {
    console.error("Reservation reminder cron failed:", err);
  }
};

const processReminder = async (
  type,
  offsetMs,
  windowStart,
  windowEnd
) => {

  const lowerBound = new Date(windowStart.getTime() + offsetMs);
  const upperBound = new Date(windowEnd.getTime() + offsetMs);

  const reservations = await UserReservations.find({
    status: "confirmed",
    userId: { $ne: null },
    "timingSlots.dateTimeSlots.timeSlots.startTime": {
      $gte: lowerBound,
      $lte: upperBound,
    },
  })
    .select("_id userId")
    .lean();

  console.log(
    `Found ${reservations.length} reservations for ${type} between ${lowerBound.toISOString()} and ${upperBound.toISOString()}`
  );

  for (const reservation of reservations) {

    try {
      await ReservationNotificationLogsModel.create({
        reservationId: reservation._id,
        type,
      });
    } catch (err) {
      continue; // already sent
    }

    sendReservationNotification({
      reservationId: reservation._id,
      action: type,
    }).catch(err =>
      console.error("Reservation reminder failed:", err)
    );
  }
};

module.exports = { runReservationReminderCron };