const formatDaypartTimes = require("./formator/formatDaypartTimes");
const DaypartRepo = require("./daypartRepository");

const { invalidate } = require("@redisCache");
const ACTIVE_DaypartS_CACHE_KEY = "Daypart:active";

const createDaypart = async (data, timezone) => {
  const Daypart = await DaypartRepo.createDaypart(data);
  return formatDaypartTimes(Daypart, timezone);
};

const getDayparts = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  user,
  date,
  sortBy,
  sortOrder,
  summary,
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  if (summary) {
    let { Dayparts, meta } = await DaypartRepo.getDaypartsSummary({
      timezone,
      page,
      limit,
      user,
      skip,
    });

    return {
      Dayparts: Dayparts.map((d) => formatDaypartTimes(d, timezone)),
      meta,
    };
  }
  let { Dayparts, meta } = await DaypartRepo.getDayparts({
    timezone,
    page,
    limit,
    keyword,
    status,
    user,
    date,
    skip,
    sortBy,
    sortOrder,
  });

  return {
    Dayparts: Dayparts.map((d) => formatDaypartTimes(d, timezone)),
    meta,
  };
};

const updateDaypart = async (id, data, timezone) => {
  const Daypart = await DaypartRepo.findDaypartById(id);
  if (!Daypart) {
    return { error: "Daypart_not_found" };
  }

  const allowedFields = [
    "name",
    "status",
    "isAllDay",
    "startTime",
    "endTime",
  ];

  const updateData = {};
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return formatDaypartTimes(Daypart, timezone);
  }

  Object.assign(Daypart, updateData);
  await Daypart.save();
  await invalidate(ACTIVE_DaypartS_CACHE_KEY);
  await invalidate(DaypartRepo.ALL_DaypartS_CACHE_KEY);

  return formatDaypartTimes(Daypart, timezone);
};

const deleteDaypart = async (id) => {
  const updated = await DaypartRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  return true;
};

const getDaypartCode = async () => {
  const code = await DaypartRepo.generateUniqueDaypartCode();
  return code;
};

module.exports = {
  createDaypart,
  getDayparts,
  updateDaypart,
  deleteDaypart,
  getDaypartCode,
};
