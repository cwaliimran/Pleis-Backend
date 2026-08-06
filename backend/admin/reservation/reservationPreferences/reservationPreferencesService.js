const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const ReservationPreferencesRepo = require("./reservationPreferencesRepository");

const getReservationPreferencess = async ({ organization }) => {
  const ReservationPreferencess =
    await ReservationPreferencesRepo.getReservationPreferencess({
      organization,
    });

  return ReservationPreferencess;
};
const updateReservationPreferences = async (id, data) => {
  const ReservationPreferences =
    await ReservationPreferencesRepo.findReservationPreferencesById(id);
  if (!ReservationPreferences) {
    return ReservationPreferencesRepo.createReservationPreferences(data);
  }

  // -----------------------------
  // ALLOWED FIELDS
  // -----------------------------
  const allowedFields = [
    "companyOrganizer",
    "isReservationEnabled",
    "timeSlotsSetting",
    "automaticResponse",
    "cancellationPolicy",
    "organization",
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
    return ReservationPreferences;
  }

  Object.assign(ReservationPreferences, updateData);
  await ReservationPreferences.save();

  return ReservationPreferences;
};

module.exports = {
  getReservationPreferencess,
  updateReservationPreferences,
};
