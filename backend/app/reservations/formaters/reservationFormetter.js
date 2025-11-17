const { convertUtcToTimezoneAMPM } = require("@utils/responseUtil");
const moment = require('moment');
const qrcode = require("qrcode");
function reservationsFormatter(item, timezone) {
  if (!item) return null;

  const cat = item.toObject ? item.toObject() : { ...item };

  if (cat.timingSlots && cat.timingSlots.dateTimeSlots) {
    const dateTimeSlots = Array.isArray(cat.timingSlots.dateTimeSlots)
      ? cat.timingSlots.dateTimeSlots
      : [cat.timingSlots.dateTimeSlots];

    dateTimeSlots.forEach(slot => {
      if (slot.timeSlots && Array.isArray(slot.timeSlots)) {
        slot.timeSlots.forEach(timeSlot => {
          let startTime = timeSlot.startTime;
          let endTime = timeSlot.endTime;

          if (moment(startTime, "hh:mm A", true).isValid()) {
            startTime = moment(startTime, "hh:mm A").toISOString();
          }
          if (moment(endTime, "hh:mm A", true).isValid()) {
            endTime = moment(endTime, "hh:mm A").toISOString();
          }

          timeSlot.startTime = convertUtcToTimezoneAMPM(startTime, timezone);
          timeSlot.endTime = convertUtcToTimezoneAMPM(endTime, timezone);
        });
      }
    });
  }

  return { ...cat };
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

  // Adjust timingSlots and flatten the structure
  if (cat.timingSlots && cat.timingSlots.dateTimeSlots) {
    const dateTimeSlot = cat.timingSlots.dateTimeSlots;  // Get the dateTimeSlots array

    // If there's only one item, move the data directly to timingSlots
    if (Array.isArray(dateTimeSlot) && dateTimeSlot.length === 1) {
      const slot = dateTimeSlot[0];  // Get the first item in the array

      // Flatten the structure directly into timingSlots
      cat.timingSlots.date = slot.date;
      cat.timingSlots.startTime = slot.timeSlots[0]?.startTime;  // Assuming one time slot
      cat.timingSlots.endTime = slot.timeSlots[0]?.endTime;  // Assuming one time slot
      cat.timingSlots._id = slot._id;
      delete cat.timingSlots.dateTimeSlots;  // Remove dateTimeSlots after flattening
    }
  }

  // Format the date field in timingSlots if it's present
  if (cat.timingSlots && cat.timingSlots.date) {
    const formattedDate = moment(cat.timingSlots.date).format("YYYY-MM-DD"); // Convert to "YYYY-MM-DD"
    cat.timingSlots.date = formattedDate;
  }

  // Handle time conversion for startTime and endTime
  if (cat.timingSlots && cat.timingSlots.startTime && cat.timingSlots.endTime) {
    let startTime = cat.timingSlots.startTime;
    let endTime = cat.timingSlots.endTime;

    // Check if startTime is a valid time format and convert to ISO string
    if (moment(startTime, "hh:mm A", true).isValid()) {
      startTime = moment(startTime, "hh:mm A").toISOString();
    }

    // Check if endTime is a valid time format and convert to ISO string
    if (moment(endTime, "hh:mm A", true).isValid()) {
      endTime = moment(endTime, "hh:mm A").toISOString();
    }

    // Convert times to the desired timezone (adjusting for start and end times)
    cat.timingSlots.startTime = convertUtcToTimezoneAMPM(startTime, timezone);
    cat.timingSlots.endTime = convertUtcToTimezoneAMPM(endTime, timezone);
  }

  return { ...cat };
};

const generateQRCode = async (reservation) => {
  // Convert the reservation object into a JSON string
  const reservationString = JSON.stringify(reservation);  

  // Pass the string as the URL (or data for QR code)
  return qrcode.toDataURL(reservationString);  
};
const logQRCode = async (reservation) => {
  try {
    const qrCode = await generateQRCode(reservation); 
       return qrCode;  
  } catch (error) {
    console.error("Error generating QR code:", error);
  }
};

module.exports = {logQRCode, reservationsFormatter,reservationsFormatterAdjustDates,userReservationsFormatter };
