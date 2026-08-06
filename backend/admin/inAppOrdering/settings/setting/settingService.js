const SetttingsRepo = require("./settingRepository");

const getSetttings = async ({ organization }) => {
  const SetttingsData = await SetttingsRepo.getSetttings({
    organization,
  });

  return SetttingsData;
};
const updateSetttings = async (organization, data) => {
  const Setttings = await SetttingsRepo.findSetttingsById(organization);
  if (!Setttings) {
    return SetttingsRepo.createSetttings({
      organization,
      companyOrganizer: data.companyOrganizer,
      paymentMethod: data.paymentMethod,
      automaticOrderAcceptance: data.automaticOrderAcceptance,
    });
  };  

  // -----------------------------
  // ALLOWED FIELDS
  // -----------------------------
  const allowedFields = ["paymentMethod", "automaticOrderAcceptance"];

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
    return Setttings;
  }

  Object.assign(Setttings, updateData);
  await Setttings.save();

  return Setttings;
};

module.exports = {
  getSetttings,
  updateSetttings,
};
