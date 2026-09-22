/**
 * Setting (admin /in-app-ordering/settings + placeOrder) and
 * Organization.inAppOrderingSettings.paymentMethods are the same product
 * flags — keep them mapped.
 *
 * Setting.paymentMethod          →  Org.paymentMethods
 *   inAppPayment + payNow        →  instantPayment
 *   inAppPayment + !payNow       →  payLater.allow
 *   cash                         →  cashPayment
 * Setting.automaticOrderAcceptance
 *   true                         →  payLater.enableOrderAcceptance = false
 *   false                        →  payLater.enableOrderAcceptance = true
 *
 * chargeOnAcceptance / chargeOnDelivery have no Setting counterpart —
 * preserved from existing org values when syncing.
 */

const mapSettingToOrgPaymentMethods = (setting = {}, existing = {}) => {
  const methods = setting.paymentMethod || {};
  const inApp = methods.inAppPayment === true;
  const payNow = methods.payNow === true;
  const cash = methods.cash === true;
  const autoAccept = setting.automaticOrderAcceptance === true;

  const existingPayLater = existing.payLater || {};

  return {
    instantPayment: inApp && payNow,
    payLater: {
      allow: inApp && !payNow,
      enableOrderAcceptance: !autoAccept,
      chargeOnAcceptance:
        existingPayLater.chargeOnAcceptance === true,
      chargeOnDelivery: existingPayLater.chargeOnDelivery === true,
    },
    cashPayment: cash,
  };
};

const mapOrgPaymentMethodsToSetting = (paymentMethods = {}, existingSetting = {}) => {
  const payLater = paymentMethods.payLater || {};
  const instant = paymentMethods.instantPayment === true;
  const laterAllow = payLater.allow === true;
  const cash = paymentMethods.cashPayment === true;

  return {
    paymentMethod: {
      inAppPayment: instant || laterAllow,
      payNow: instant,
      cash,
    },
    automaticOrderAcceptance:
      payLater.enableOrderAcceptance === undefined
        ? existingSetting.automaticOrderAcceptance === true
        : payLater.enableOrderAcceptance !== true,
  };
};

module.exports = {
  mapSettingToOrgPaymentMethods,
  mapOrgPaymentMethodsToSetting,
};
