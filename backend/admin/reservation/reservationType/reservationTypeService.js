const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const ReservationTypeRepo = require("./reservationTypeRepository");

const { cache, invalidate } = require("@redisCache");
const ACTIVE_ReservationTypeS_CACHE_KEY = "ReservationType:active";
const createReservationType = async (data) => {
  let ReservationTypeData =
    await ReservationTypeRepo.createReservationType(data);
  return ReservationTypeData;
};
const getReservationTypes = async ({
  timezone,
  page,
  limit,
  status,
  summary,
  organization,
  conditionType,
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  if (summary) {
    let { ReservationTypes, meta } =
      await ReservationTypeRepo.getReservationTypesSummary({
        timezone,
        page,
        limit,
        organization,
        skip,
      });
    return {
      ReservationTypes,
      meta,
    };
  }
  let { ReservationTypes, meta } =
    await ReservationTypeRepo.getReservationTypes({
      timezone,
      page,
      limit,
      status,
      organization,
      conditionType,
      skip,
    });

  return {
    ReservationTypes,
    meta,
  };
};
const updateReservationType = async (id, data) => {
  const ReservationType = await ReservationTypeRepo.findReservationTypeById(id);
  if (!ReservationType) {
    return { error: "ReservationType_not_found" };
  }

  // -----------------------------
  // ALLOWED FIELDS
  // -----------------------------
  const allowedFields = [
    "name",
    "description",
    "numberOfTables",
    "maxCapacity",
    "maxPartySize",
    "conditionType",
    "bonosPoints",
    "isVisibleToGuest",
    "notes",
    "requireConfirmationToApprove",
    "occasionRequired",
    "tax",
    "status",
  ];


  // -----------------------------
  // APPLY UPDATE FIELDS
  // -----------------------------
  const updateData = {};
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return ReservationType;
  }

  Object.assign(ReservationType, updateData);
  await ReservationType.save();
  await invalidate(ACTIVE_ReservationTypeS_CACHE_KEY);

  return ReservationType;
};

const deleteReservationType = async (id) => {
  const updated = await ReservationTypeRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  return true;
};

module.exports = {
  createReservationType,
  getReservationTypes,
  updateReservationType,
  deleteReservationType,
};
