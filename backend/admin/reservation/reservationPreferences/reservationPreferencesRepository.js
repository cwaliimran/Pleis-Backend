const ReservationPreferences = require("@ReservationPreferencesModel");
const { buildKeywordQueryFromModels } = require("@utils/dbUtils/queryUtil");
const { generateMeta } = require("@utils/responseUtil");

const createReservationPreferences = async (data) => {
  const newReservationPreferences = new ReservationPreferences(data);
  await newReservationPreferences.save();
  return newReservationPreferences;
};

const getReservationPreferencess = async ({ organization }) => {
  const reservationPreferences = await ReservationPreferences.findOne({
    organization: organization,
  }).lean();

  if (!reservationPreferences) {
    return null
  }

  return {
    reservationPreferences,
  };
};


const findReservationPreferencesById = async (id) => {
  return ReservationPreferences.findById(id);
};

const findByIdAndUpdate = async (id, data) => {
  await invalidate(ACTIVE_ReservationPreferencesS_CACHE_KEY);
  return ReservationPreferences.findByIdAndUpdate(id, data, { new: true });
};
module.exports = {
  getReservationPreferencess,
  findReservationPreferencesById,
  findByIdAndUpdate,
  createReservationPreferences,
};
