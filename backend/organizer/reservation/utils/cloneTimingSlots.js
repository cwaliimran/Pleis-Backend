const moment = require("moment-timezone");
const mongoose = require("mongoose");

const cloneTimingSlots = ({ timingSlots, targetDate, timezone }) => {
  if (!timingSlots?.dateTimeSlots?.length) return timingSlots;

  return {
    dateTimeSlots: timingSlots.dateTimeSlots.map((block) => {
      const newDate = moment
        .tz(targetDate, timezone)
        .startOf("day")
        .utc()
        .toDate();

      const newTimeSlots = block.timeSlots.map((slot) => {
        const start = moment(slot.startTime).tz(timezone);
        const end = moment(slot.endTime).tz(timezone);

        return {
          startTime: moment
            .tz(targetDate, timezone)
            .hour(start.hour())
            .minute(start.minute())
            .second(0)
            .millisecond(0)
            .utc()
            .toDate(),

          endTime: moment
            .tz(targetDate, timezone)
            .hour(end.hour())
            .minute(end.minute())
            .second(0)
            .millisecond(0)
            .utc()
            .toDate(),

          // ✅ DO NOT copy slot._id
        };
      });

      return {
        date: newDate,
        timeSlots: newTimeSlots,

        // ✅ DO NOT copy block._id
      };
    }),
  };
};

module.exports = {
  cloneTimingSlots,
};
