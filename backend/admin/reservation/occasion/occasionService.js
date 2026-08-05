const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const OccasionRepo = require("./occasionRepository");

const { cache, invalidate } = require("@redisCache");
const ACTIVE_Occasion_CACHE_KEY = "Occasion:active";
const createOccasion = async (data) => {
  let OccasionData = await OccasionRepo.createOccasion(data);
  return OccasionData;
};
const getOccasion = async ({ organization }) => {
  const occasion = await OccasionRepo.getOccasion({
    organization,
  });

  return occasion;
};
const updateOccasion = async (id, data) => {
  const Occasion = await OccasionRepo.findOccasionById(id);
  if (!Occasion) {
    return { error: "Occasion_not_found" };
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
    return Occasion;
  }

  Object.assign(Occasion, updateData);
  await Occasion.save();
  await invalidate(ACTIVE_Occasion_CACHE_KEY);

  return Occasion;
};

const deleteOccasion = async (id) => {
  const deleted = await OccasionRepo.findByIdAndDelete(id);
  if (!deleted) return null;
  return true;
};

module.exports = {
  createOccasion,
  getOccasion,
  updateOccasion,
  deleteOccasion,
};
