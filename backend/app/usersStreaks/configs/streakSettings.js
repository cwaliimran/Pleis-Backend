module.exports = {
  DAILY_RESET_HOUR: 5, // 5 AM
  MAX_ORGANIZATIONS_PER_DAY: 5, 
  MAX_CHECKINS_PER_DAY: 5,
  CHECKIN_COOLDOWN_MINUTES: 30,
  POINTS_PER_ORGANIZATION_PER_DAY: 1,
};

exports.getTodayResetTime = (timezone = "UTC") => {
  const now = new Date();
  const local = new Date(now.toLocaleString("en-US", { timeZone: timezone }));

  let reset = new Date(local);
  reset.setHours(DAILY_RESET_HOUR, 0, 0, 0);

  // if current time is before 5AM → use previous day 5AM
  if (local < reset) {
    reset.setDate(reset.getDate() - 1);
  }

  return reset;
};