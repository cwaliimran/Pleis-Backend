const { validateParams, convertTimezoneToUtc } = require("@utils/responseUtil");

/**
 * ✅ Validates reservation
 * ✅ Converts timingSlots to UTC
 * ✅ Returns UPDATED reservation
 */
const validateReservationPayload = (req, res, reservation) => {
  const timezone = req.user.timezone;
  const userType = req.user.userType;

  // ==============================
  // 1️⃣ Basic validation
  // ==============================
  const originalBody = req.body;
  req.body = reservation;

  try {
    const rawData = ["organizationId", "partySize", "companyOrganizer", "reservationType"];

    // These are required for non-user types
    // if (userType !== "user") {
    //   rawData.push("timingSlots");
    // }
    if (
      !validateParams(req, res, {
        rawData,
        enumFields: {
          "paymentDetails.paymentMethod": ["applePay", "card", "cash"],
        },
        objectIdFields: ["organizationId", "companyOrganizer", "optionalEventId", "reservationType", "occasion"],
      })
    ) {
      return null;
    }
  } finally {
    req.body = originalBody;
  }

  // ==============================
  // 2️⃣ TimingSlots validation + UTC conversion
  // ==============================
  const timingSlots = reservation.timingSlots;

  if (timingSlots?.dateTimeSlots?.length) {
    for (const dateBlock of timingSlots.dateTimeSlots) {
      if (!dateBlock.date) {
        res.status(400).json({
          translationKey: "invalid_date_in_timing_slots",
        });
        return null;
      }
      if (dateBlock.timeSlots?.length) {
        if (!Array.isArray(dateBlock.timeSlots) || !dateBlock.timeSlots.length) {
          res.status(400).json({
            translationKey: "time_slots_required_for_date",
          });
          return null;
        }

        for (const slot of dateBlock.timeSlots) {
          if (!slot.startTime || !slot.endTime) {
            res.status(400).json({
              translationKey: "invalid_start_or_end_time_in_slot",
            });
            return null;
          }

          slot.startTime = convertTimezoneToUtc(
            `${dateBlock.date} ${slot.startTime}`,
            timezone,
            "YYYY-MM-DD HH:mm",
          );

          slot.endTime = convertTimezoneToUtc(
            `${dateBlock.date} ${slot.endTime}`,
            timezone,
            "YYYY-MM-DD HH:mm",
          );
        }
      }
    }
  }

  return reservation;
};

module.exports = { validateReservationPayload };
