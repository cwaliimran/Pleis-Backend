const moment = require("moment-timezone");

const HH_MM_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const hasTimeValue = (value) => value != null && value !== "";

const timeToMinutes = (time) => {
  const [hours, minutes] = String(time).split(":").map(Number);
  return hours * 60 + minutes;
};

const getDayKey = (now, timezone) => {
  if (timezone) {
    return DAY_KEYS[moment(now).tz(timezone).day()];
  }
  return DAY_KEYS[now.getUTCDay()];
};

/**
 * startTime/endTime are optional UTC "HH:mm" strings.
 * Both null = no time restriction. One without the other is invalid.
 * startTime > endTime is valid (midnight-crossing window).
 */
const validatePromotionTimes = (startTime, endTime) => {
  const hasStart = hasTimeValue(startTime);
  const hasEnd = hasTimeValue(endTime);

  if (hasStart !== hasEnd) {
    throw new Error(
      "startTime and endTime must both be provided or both be null",
    );
  }

  if (!hasStart && !hasEnd) {
    return { startTime: null, endTime: null };
  }

  if (!HH_MM_PATTERN.test(startTime) || !HH_MM_PATTERN.test(endTime)) {
    throw new Error("startTime and endTime must be in HH:mm format");
  }

  return { startTime, endTime };
};

const resolvePromotionTimes = (incoming = {}, existing = {}) => {
  const startTime =
    incoming.startTime !== undefined ? incoming.startTime : existing.startTime;
  const endTime =
    incoming.endTime !== undefined ? incoming.endTime : existing.endTime;

  return validatePromotionTimes(startTime, endTime);
};

/**
 * Convert a request time pair to stored UTC "HH:mm".
 * Throws if only one of startTime/endTime is present.
 */
const preparePromotionTimesForStorage = (
  data,
  timezone,
  convertTimezoneToUtc,
) => {
  const startProvided = Object.prototype.hasOwnProperty.call(data, "startTime");
  const endProvided = Object.prototype.hasOwnProperty.call(data, "endTime");

  if (startProvided !== endProvided) {
    throw new Error(
      "startTime and endTime must both be provided or both be null",
    );
  }

  if (!startProvided) {
    return data;
  }

  const times = validatePromotionTimes(data.startTime, data.endTime);
  data.startTime = times.startTime;
  data.endTime = times.endTime;

  if (!data.startTime) {
    return data;
  }

  const converted = validatePromotionTimes(
    convertTimezoneToUtc(data.startTime, timezone, "HH:mm", "HH:mm"),
    convertTimezoneToUtc(data.endTime, timezone, "HH:mm", "HH:mm"),
  );

  data.startTime = converted.startTime;
  data.endTime = converted.endTime;
  return data;
};

/**
 * Optional time-of-day eligibility.
 * Stored startTime/endTime are UTC "HH:mm". null/null skips the check.
 */
const isPromotionTimeActive = ({
  startTime,
  endTime,
  now = new Date(),
} = {}) => {
  if (!hasTimeValue(startTime) && !hasTimeValue(endTime)) {
    return true;
  }

  if (!hasTimeValue(startTime) || !hasTimeValue(endTime)) {
    return false;
  }

  if (!HH_MM_PATTERN.test(startTime) || !HH_MM_PATTERN.test(endTime)) {
    return false;
  }

  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

  return startMinutes <= endMinutes
    ? currentMinutes >= startMinutes && currentMinutes <= endMinutes
    : currentMinutes >= startMinutes || currentMinutes <= endMinutes;
};

const isPromotionDayActive = ({
  activeDays,
  now = new Date(),
  timezone,
} = {}) => {
  if (!activeDays || activeDays.mode !== "selective" || !activeDays.days?.length) {
    return true;
  }

  return activeDays.days.includes(getDayKey(now, timezone));
};

const isPromotionRecurrenceActive = ({
  recurringDetails,
  now = new Date(),
  timezone,
} = {}) => {
  if (!recurringDetails?.isEnabled) {
    return true;
  }

  if (recurringDetails.endDate && now > new Date(recurringDetails.endDate)) {
    return false;
  }

  if (
    recurringDetails.frequency === "weekly" &&
    recurringDetails.daysOfWeek?.length
  ) {
    if (!recurringDetails.daysOfWeek.includes(getDayKey(now, timezone))) {
      return false;
    }
  }

  return true;
};

const isPromotionScheduleActive = ({
  startDate,
  endDate,
  startTime,
  endTime,
  activeDays,
  recurringDetails,
  now = new Date(),
  timezone,
} = {}) => {
  if (startDate && now < new Date(startDate)) {
    return false;
  }

  if (endDate && now > new Date(endDate)) {
    return false;
  }

  if (!isPromotionRecurrenceActive({ recurringDetails, now, timezone })) {
    return false;
  }

  if (!isPromotionDayActive({ activeDays, now, timezone })) {
    return false;
  }

  return isPromotionTimeActive({ startTime, endTime, now });
};

const getPromotionScheduleReasons = (
  promotion = {},
  now = new Date(),
  timezone,
) => {
  const reasons = [];

  if (
    !isPromotionRecurrenceActive({
      recurringDetails: promotion.recurringDetails,
      now,
      timezone,
    })
  ) {
    reasons.push("PROMOTION_RECURRENCE_INACTIVE");
  }

  if (
    !isPromotionDayActive({
      activeDays: promotion.activeDays,
      now,
      timezone,
    })
  ) {
    reasons.push("PROMOTION_DAY_INACTIVE");
  }

  if (
    !isPromotionTimeActive({
      startTime: promotion.startTime,
      endTime: promotion.endTime,
      now,
    })
  ) {
    reasons.push("PROMOTION_TIME_INACTIVE");
  }

  return reasons;
};

module.exports = {
  HH_MM_PATTERN,
  hasTimeValue,
  timeToMinutes,
  validatePromotionTimes,
  resolvePromotionTimes,
  preparePromotionTimesForStorage,
  isPromotionTimeActive,
  isPromotionDayActive,
  isPromotionRecurrenceActive,
  isPromotionScheduleActive,
  getPromotionScheduleReasons,
};
