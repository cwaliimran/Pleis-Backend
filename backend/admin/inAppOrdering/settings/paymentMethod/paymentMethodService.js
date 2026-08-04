const PaymentMethodRepo = require("./paymentMethodRepository");

const getPaymentMethods = async ({ organization, companyOrganizer }) => {
  const PaymentMethodData = await PaymentMethodRepo.getPaymentMethods({
    organization,
    companyOrganizer,
  });

  return PaymentMethodData;
};
const updatePaymentMethod = async (id, data) => {
  const PaymentMethod = await PaymentMethodRepo.findPaymentMethodById(id);
  if (!PaymentMethod) {
    return { error: "PaymentMethod_not_found" };
  }

  // -----------------------------
  // ALLOWED FIELDS
  // -----------------------------
  const allowedFields = ["inAppPayments", "payNow"];

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
    return PaymentMethod;
  }

  Object.assign(PaymentMethod, updateData);
  await PaymentMethod.save();

  return PaymentMethod;
};

module.exports = {
  getPaymentMethods,
  updatePaymentMethod,
};
