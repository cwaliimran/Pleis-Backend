const { validateParams, convertTimezoneToUtc } = require("@utils/responseUtil");

/**
 * ✅ Validates reservation
 * ✅ Converts timingSlots to UTC
 * ✅ Returns UPDATED reservation
 */
const validateReservationPayload = (req, res, reservation) => {
  const timezone = req.user.timezone;

  // ==============================
  // 1️⃣ Basic validation
  // ==============================
  const originalBody = req.body;
  req.body = reservation;

  try {
    if (
      !validateParams(req, res, {
        rawData: [
          "partySize",
          "timingSlots",
          "organizationId",
          "companyOrganizer",
        ],
        enumFields: {
          "paymentDetails.paymentMethod": ["applePay", "card", "cash"],
        },
        objectIdFields: [
          "organizationId",
          "companyOrganizer",
          "reservationId",
          "optionalEventId",
        ],
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

        // ✅ THIS NOW RUNS
        slot.startTime = convertTimezoneToUtc(
          slot.startTime,
          timezone,
          "YYYY-MM-DDTHH:mm:ss.SSS[Z]",
        );

        slot.endTime = convertTimezoneToUtc(
          slot.endTime,
          timezone,
          "YYYY-MM-DDTHH:mm:ss.SSS[Z]",
        );
      }
    }
  }

  return reservation;
};

module.exports = { validateReservationPayload };
