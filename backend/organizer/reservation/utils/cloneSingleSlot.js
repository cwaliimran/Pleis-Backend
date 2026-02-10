const moment = require("moment-timezone");

const cloneSingleSlot = ({
  timingSlots,
  targetDate,
  startTime,
  timezone,
}) => {
  if (!timingSlots?.dateTimeSlots?.length) {
    throw new Error("No timing slots found");
  }

  // Take FIRST slot only
  const originalBlock = timingSlots.dateTimeSlots[0];
  const originalSlot = originalBlock.timeSlots[0];

  if (!originalSlot) {
    throw new Error("No time slot found");
  }

  // 🔹 Calculate duration in minutes
  const originalStart = moment(originalSlot.startTime);
  const originalEnd = moment(originalSlot.endTime);
  const durationMinutes = originalEnd.diff(originalStart, "minutes");

  // 🔹 New start time
  const newStart = moment
    .tz(`${targetDate} ${startTime}`, "YYYY-MM-DD hh:mm A", timezone)
    .utc();

  // 🔹 New end time = start + duration
  const newEnd = newStart.clone().add(durationMinutes, "minutes");

  return {
    dateTimeSlots: [
      {
        date: moment
          .tz(targetDate, timezone)
          .startOf("day")
          .utc()
          .toDate(),

        timeSlots: [
          {
            startTime: newStart.toDate(),
            endTime: newEnd.toDate(),
          },
        ],
      },
    ],
  };
};

module.exports = {
  cloneSingleSlot,
};
