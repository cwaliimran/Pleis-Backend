const { getFullImageUrl } = require("@utils/imageHelper");
const { convertUtcToTimezoneAMPM } = require("@utils/responseUtil");
const moment = require('moment');
const qrcode = require("qrcode");
function reservationsFormatter(item, timezone) {
  if (!item) return null;

  const cat = item.toObject ? item.toObject() : { ...item };

  // ---- Main timingSlots ----
  if (cat.timingSlots?.dateTimeSlots) {
    cat.timingSlots.dateTimeSlots =
      formatDateTimeSlots(
        cat.timingSlots.dateTimeSlots,
        timezone
      );
  }

  // ---- Reservation changes timing ----
  if (Array.isArray(cat.reservationChanges)) {
    cat.reservationChanges = cat.reservationChanges.map(change => {
      if (change.oldTiming?.dateTimeSlots) {
        change.oldTiming.dateTimeSlots =
          formatDateTimeSlots(
            change.oldTiming.dateTimeSlots,
            timezone
          );
      }

      if (change.newTiming?.dateTimeSlots) {
        change.newTiming.dateTimeSlots =
          formatDateTimeSlots(
            change.newTiming.dateTimeSlots,
            timezone
          );
      }

      return change;
    });
  }
  console.log("Formatted Reservation Data:", JSON.stringify(cat, null, 2));

  return cat;
}
function formatDateTimeSlots(dateTimeSlots, timezone) {
  if (!dateTimeSlots) return dateTimeSlots;

  const slots = Array.isArray(dateTimeSlots)
    ? dateTimeSlots
    : [dateTimeSlots];

  slots.forEach(slot => {
    if (!slot.timeSlots) return;

    slot.date = moment(slot.date).format("YYYY-MM-DD");

    const timeSlots = Array.isArray(slot.timeSlots)
      ? slot.timeSlots
      : [slot.timeSlots];

    timeSlots.forEach(timeSlot => {
      let { startTime, endTime } = timeSlot;

      if (moment(startTime, "hh:mm A", true).isValid()) {
        startTime = moment(startTime, "hh:mm A").toISOString();
      }

      if (moment(endTime, "hh:mm A", true).isValid()) {
        endTime = moment(endTime, "hh:mm A").toISOString();
      }

      timeSlot.startTime =
        convertUtcToTimezoneAMPM(startTime, timezone);
      timeSlot.endTime =
        convertUtcToTimezoneAMPM(endTime, timezone);
    });

    slot.timeSlots = timeSlots;
  });

  return slots;
}

function reservationsFormatterAdjustDates(item, timezone) {
  if (!item) return null;

  let cat;
  try {
    cat = item.toObject
      ? item.toObject()
      : JSON.parse(JSON.stringify(item));
  } catch {
    cat = { ...item };
  }

  // ---- Main timing ----
  if (cat.timingSlots?.dateTimeSlots) {
    cat.timingSlots.dateTimeSlots =
      formatDateTimeSlots(
        cat.timingSlots.dateTimeSlots,
        timezone
      );
  }

  // ---- Reservation changes ----
  if (Array.isArray(cat.reservationChanges)) {
    cat.reservationChanges.forEach(change => {
      if (change.oldTiming?.dateTimeSlots) {
        change.oldTiming.dateTimeSlots =
          formatDateTimeSlots(
            change.oldTiming.dateTimeSlots,
            timezone
          );
      }

      if (change.newTiming?.dateTimeSlots) {
        change.newTiming.dateTimeSlots =
          formatDateTimeSlots(
            change.newTiming.dateTimeSlots,
            timezone
          );
      }
    });
  }

  return cat;
}


const userReservationsFormatter = (item, timezone) => {
  if (!item) return null;

  const cat = item.toObject
    ? item.toObject()
    : { ...item };

  // Normalize timing
  if (cat.timingSlots?.dateTimeSlots) {
    cat.timingSlots.dateTimeSlots =
      formatDateTimeSlots(
        cat.timingSlots.dateTimeSlots,
        timezone
      );
  }

  // Normalize reservation changes
  if (Array.isArray(cat.reservationChanges)) {
    cat.reservationChanges.forEach(change => {
      if (change.oldTiming?.dateTimeSlots) {
        change.oldTiming.dateTimeSlots =
          formatDateTimeSlots(
            change.oldTiming.dateTimeSlots,
            timezone
          );
      }

      if (change.newTiming?.dateTimeSlots) {
        change.newTiming.dateTimeSlots =
          formatDateTimeSlots(
            change.newTiming.dateTimeSlots,
            timezone
          );
      }
    });
  }

  /* ---------------------------
     Event start date
  --------------------------- */
  if (cat.eventStartDate) {
    const start = moment(cat.eventStartDate);

    cat.eventDate = start.format("YYYY-MM-DD");
    cat.eventTime =
      convertUtcToTimezoneAMPM(
        start.toISOString(),
        timezone
      );

    delete cat.eventStartDate;
  }

  /* ---------------------------
     Images
  --------------------------- */
  cat.profileIcon =
    getFullImageUrl(cat.profileIcon || "noimage.png");

  cat.organizationCover =
    getFullImageUrl(cat.organizationCover || "noimage.png");

  cat.organizationLogo =
    getFullImageUrl(cat.organizationLogo || "noimage.png");

  /* ---------------------------
     Single slot flattening
  --------------------------- */
  if (
    cat.timingSlots &&
    Array.isArray(cat.timingSlots.dateTimeSlots) &&
    cat.timingSlots.dateTimeSlots.length === 1
  ) {
    const slot = cat.timingSlots.dateTimeSlots[0];

    cat.timingSlots.date = slot.date;

    const start = slot.timeSlots?.[0]?.startTime;
    const end = slot.timeSlots?.[0]?.endTime;

    if (start) cat.timingSlots.startTime = start;
    if (end) cat.timingSlots.endTime = end;

    delete cat.timingSlots.dateTimeSlots;
  }

  /* ---------------------------
     Preorder images
  --------------------------- */
  if (cat.preOrderMenuItemsOrder?.items) {
    cat.preOrderMenuItemsOrder.items =
      cat.preOrderMenuItemsOrder.items.map(i => {
        i.menuItemSnapShot.image =
          getFullImageUrl(
            i.menuItemSnapShot.image || "noimage.png"
          );
        return i;
      });
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
 
  }
};

module.exports = { logQRCode, reservationsFormatter, reservationsFormatterAdjustDates, userReservationsFormatter };
