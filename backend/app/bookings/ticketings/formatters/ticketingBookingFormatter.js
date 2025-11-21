const { convertUtcToTimezone } = require("@utils/responseUtil"); // assume you have this util
const { getFullImageUrl } = require("@utils/imageHelper");

const formatTicketingBooking = (item, options = {}) => {
  if (!item) return null;

  let obj = typeof item.toObject === "function" ? item.toObject() : item;

  const { timezone = "UTC" } = options;
   if (obj.organization?.basicInfo?.media?.logo) {
      const logoName = obj.organization.basicInfo.media.logo;
      obj.organization.basicInfo.media.logo = getFullImageUrl(logoName);
    }

  // Convert event.schedule.startDateTime and endDateTime to timezone if present
  if (
    obj.ticket &&
    obj.ticket.snapshot &&
    obj.ticket.snapshot.event &&
    obj.ticket.snapshot.event.schedule
  ) {
    const schedule = obj.ticket.snapshot.event.schedule;
    if (schedule.startDateTime)
      schedule.startDateTime = convertUtcToTimezone(schedule.startDateTime, timezone, "YYYY-MM-DD hh:mm A");
    if (schedule.endDateTime)
      schedule.endDateTime = convertUtcToTimezone(schedule.endDateTime, timezone, "YYYY-MM-DD hh:mm A");
    // If recurringDetails.endDate exists, convert it too
    if (schedule.recurringDetails && schedule.recurringDetails.endDate)
      schedule.recurringDetails.endDate = convertUtcToTimezone(schedule.recurringDetails.endDate, timezone, "YYYY-MM-DD hh:mm A");
  }

  if (
    obj.ticket &&
    obj.ticket.snapshot &&
    obj.ticket.snapshot.event &&
    obj.ticket.snapshot.event.basicInfo && 
    obj.ticket.snapshot.event.basicInfo.media &&
    obj.ticket.snapshot.event.basicInfo.media.name
  ) {
    const media = obj.ticket.snapshot.event.basicInfo.media;
      obj.ticket.snapshot.event.basicInfo.media = getFullImageUrl(media.name);
  }

  // Format nested snapshot.timingSlots.selectedSlot times
  if (
    obj.ticket &&
    obj.ticket.snapshot &&
    obj.ticket.snapshot.timingSlots &&
    obj.ticket.snapshot.timingSlots.selectedSlot
  ) {
    const selectedSlot = obj.ticket.snapshot.timingSlots.selectedSlot;
    if (selectedSlot.startTime)
      selectedSlot.startTime = convertUtcToTimezone(selectedSlot.startTime, timezone, "YYYY-MM-DD hh:mm A");
    if (selectedSlot.endTime)
      selectedSlot.endTime = convertUtcToTimezone(selectedSlot.endTime, timezone, "YYYY-MM-DD hh:mm A");
  }

   // Remove protectionUserDetails if resaleProtection is "none"
  if (
    obj.ticket &&
    obj.ticket.snapshot &&
    obj.ticket.snapshot.resaleProtection === "none"
  ) {
    delete obj.ticket.protectionUserDetails;
  }

  return obj;
};

module.exports = { formatTicketingBooking };
