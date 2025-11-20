

const DAILY_RESET_HOUR = 5; // 5 AM
const MAX_ORGANIZATIONS_PER_DAY = 5;
const MAX_CHECKINS_PER_DAY = 5;
const CHECKIN_COOLDOWN_MINUTES = 30;
const POINTS_PER_ORGANIZATION_PER_DAY = 1;

const getTodayResetTime = (timezone = "UTC") => {
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

export {
  DAILY_RESET_HOUR,
  MAX_ORGANIZATIONS_PER_DAY,
  MAX_CHECKINS_PER_DAY,
  CHECKIN_COOLDOWN_MINUTES,
  POINTS_PER_ORGANIZATION_PER_DAY,
  getTodayResetTime,
};

/* 
| Requirement                                   | Status        |
| --------------------------------------------- | ------------- |
| Day resets at **5 AM**                        | ✅ Implemented |
| Only **1 reward per organization per day**    | ✅ Implemented |
| Users can check-in unlimited times            | ✅ Allowed     |
| But only **1 point per venue per day**        | ✅ Enforced    |
| Max **5 organizations per day**               | ✅ Enforced    |
| **30 min cooldown** between check-ins         | ✅ Enforced    |
| Max **5 check-ins per day**                   | ✅ Enforced    |
| Points follow streak rule only on valid visit | ✅ Implemented |
| Settings moved to separate utility            | ✅ Done        |
*/