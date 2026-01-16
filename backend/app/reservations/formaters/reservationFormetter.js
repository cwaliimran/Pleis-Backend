const { getFullImageUrl } = require("@utils/imageHelper");
const { convertUtcToTimezoneAMPM } = require("@utils/responseUtil");
const moment = require('moment');
const qrcode = require("qrcode");
function reservationsFormatter(item, timezone) {
  if (!item) return null;

  const cat = item.toObject ? item.toObject() : { ...item };

  if (cat.timingSlots?.dateTimeSlots) {
    const dateTimeSlots = Array.isArray(cat.timingSlots.dateTimeSlots)
      ? cat.timingSlots.dateTimeSlots
      : [cat.timingSlots.dateTimeSlots]; // normalize to array

    dateTimeSlots.forEach(slot => {
      if (!slot.timeSlots) return;

      slot.date = moment(slot.date).format("YYYY-MM-DD");
      // normalize timeSlots into array too
      const timeSlots = Array.isArray(slot.timeSlots)
        ? slot.timeSlots
        : [slot.timeSlots];

      timeSlots.forEach(timeSlot => {
        let startTime = timeSlot.startTime;
        let endTime = timeSlot.endTime;

        // if they come as "hh:mm A" convert to ISO
        if (moment(startTime, "hh:mm A", true).isValid()) {
          startTime = moment(startTime, "hh:mm A").toISOString();
        }
        if (moment(endTime, "hh:mm A", true).isValid()) {
          endTime = moment(endTime, "hh:mm A").toISOString();
        }


        timeSlot.startTime = convertUtcToTimezoneAMPM(startTime, timezone);
        timeSlot.endTime = convertUtcToTimezoneAMPM(endTime, timezone);
      });

      // write normalized back
      slot.timeSlots = timeSlots;
    });

    cat.timingSlots.dateTimeSlots = dateTimeSlots;
  }

  return cat;
}

function reservationsFormatterAdjustDates(item, timezone) {
  if (!item) return null;

  const cat = item.toObject ? item.toObject() : { ...item };

  // Adjust timingSlots and dateTimeSlots
  if (cat.timingSlots && cat.timingSlots.dateTimeSlots) {
    const dateTimeSlots = Array.isArray(cat.timingSlots.dateTimeSlots)
      ? cat.timingSlots.dateTimeSlots
      : [cat.timingSlots.dateTimeSlots];

    dateTimeSlots.forEach(slot => {
      // Format the date field (convert to YYYY-MM-DD)
      if (slot.date) {
        const formattedDate = moment(slot.date).format("YYYY-MM-DD"); // Convert to "YYYY-MM-DD"
        slot.date = formattedDate;
      }

      // Handle timeSlots if present
      if (slot.timeSlots && Array.isArray(slot.timeSlots)) {
        slot.timeSlots.forEach(timeSlot => {
          let startTime = timeSlot.startTime;
          let endTime = timeSlot.endTime;

          // Check if startTime is a valid time format and convert to ISO string
          if (moment(startTime, "hh:mm A", true).isValid()) {
            startTime = moment(startTime, "hh:mm A").toISOString();
          }

          // Check if endTime is a valid time format and convert to ISO string
          if (moment(endTime, "hh:mm A", true).isValid()) {
            endTime = moment(endTime, "hh:mm A").toISOString();
          }

          // Convert times to the desired timezone (adjusting for start and end times)
          timeSlot.startTime = convertUtcToTimezoneAMPM(startTime, timezone);
          timeSlot.endTime = convertUtcToTimezoneAMPM(endTime, timezone);
        });
      }
    });
  }

  return { ...cat };
}



const userReservationsFormatter = (item, timezone) => {
  if (!item) return null;

  const cat = item.toObject ? item.toObject() : { ...item };

  // ---------------------------
  // 1. HANDLE eventStartDate  → eventDate + eventTime
  // ---------------------------
  if (cat.eventStartDate) {
    const start = moment(cat.eventStartDate);   // original UTC datetime

    // Extract date
    cat.eventDate = start.format("YYYY-MM-DD");

    // Extract time in AM/PM converted to user's timezone
    cat.eventTime = convertUtcToTimezoneAMPM(start.toISOString(), timezone);
    delete cat.eventStartDate;
  }
  cat.profileIcon = getFullImageUrl(cat.profileIcon || "noimage.png");
  cat.organizationCover = getFullImageUrl(cat.organizationCover || "noimage.png");
  cat.organizationLogo = getFullImageUrl(cat.organizationLogo || "noimage.png");
  // ---------------------------
  // 2. HANDLE dateTimeSlots ARRAY
  // ---------------------------
  if (cat.timingSlots && cat.timingSlots.dateTimeSlots) {
    const dateTimeSlot = cat.timingSlots.dateTimeSlots;

    if (Array.isArray(dateTimeSlot) && dateTimeSlot.length === 1) {
      const slot = dateTimeSlot[0];

      cat.timingSlots.date = moment(slot.date).format("YYYY-MM-DD");

      const start = slot.timeSlots?.[0]?.startTime;
      const end = slot.timeSlots?.[0]?.endTime;

      if (start) {
        cat.timingSlots.startTime = convertUtcToTimezoneAMPM(start, timezone);
      }
      if (end) {
        cat.timingSlots.endTime = convertUtcToTimezoneAMPM(end, timezone);
      }

      delete cat.timingSlots.dateTimeSlots;
    }
  }

  return { ...cat };
};


const generateQRCode = async (reservation) => {
  // Pick only required fields
  const qrData = {
    reservationType: reservation.reservationType,
    amount: reservation.amount,
    timingSlots: reservation.timingSlots,
    organizationName: reservation.organizationName,
    eventName: reservation.eventName,
    userName: reservation.userName,
    eventDate: reservation.eventDate,
    eventTime: reservation.eventTime,
  };

  // Convert to string and generate QR
  return await qrcode.toDataURL(JSON.stringify(qrData), {
    errorCorrectionLevel: "H",
  });
};

const logQRCode = async (reservation) => {
  try {
    const qrCode = await generateQRCode(reservation);
    return qrCode;
  } catch (error) {
    console.error("Error generating QR code:", error);
  }
};

module.exports = { logQRCode, reservationsFormatter, reservationsFormatterAdjustDates, userReservationsFormatter };
