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
  }

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

  const prevPaymentMethod =
    Setttings.paymentMethod?.toObject?.() || Setttings.paymentMethod || {};

  Object.assign(Setttings, updateData);
  // Deep-merge paymentMethod so sparse PUTs don't wipe sibling flags
  if (data.paymentMethod && typeof data.paymentMethod === "object") {
    Setttings.paymentMethod = {
      inAppPayment:
        data.paymentMethod.inAppPayment !== undefined
          ? data.paymentMethod.inAppPayment
          : prevPaymentMethod.inAppPayment,
      payNow:
        data.paymentMethod.payNow !== undefined
          ? data.paymentMethod.payNow
          : prevPaymentMethod.payNow,
      cash:
        data.paymentMethod.cash !== undefined
          ? data.paymentMethod.cash
          : prevPaymentMethod.cash,
    };
  }
  await Setttings.save();
  await SetttingsRepo.invalidateOrganizationSettingsCache(organization);
  await SetttingsRepo.syncOrganizationPaymentMethodsFromSetting(
    organization,
    Setttings.toObject ? Setttings.toObject() : Setttings,
  );

  return Setttings;
};

module.exports = {
  getSetttings,
  updateSetttings,
};
