const PaymentMethodRepo = require("./paymentMethodRepository");

const getPaymentMethods = async ({ organization }) => {
  const PaymentMethodData = await PaymentMethodRepo.getPaymentMethods({
    organization,
  });

  return PaymentMethodData;
};
const updatePaymentMethod = async (organization, data) => {
  const PaymentMethod = await PaymentMethodRepo.findPaymentMethodById(organization);
  console.log("data",data );
  if (!PaymentMethod) {
    return PaymentMethodRepo.createPaymentMethod({
      organization,
      companyOrganizer: data.companyOrganizer,
      inAppPayments: data.inAppPayments,
      payNow: data.payNow,
      cash: data.cash
    });
  }

  // -----------------------------
  // ALLOWED FIELDS
  // -----------------------------
  const allowedFields = ["inAppPayments", "payNow","cash"];

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
