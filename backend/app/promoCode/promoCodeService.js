const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const promoCodeRepo = require("./promoCodeRepository");


const usePromoCode = async (data) => {
  let promoCode = await promoCodeRepo.usePromoCode(data);
  return promoCode;
};
const validatePromoCode = async (data) => {
  let promoCode = await promoCodeRepo.validatePromoCode(data);
  return promoCode;
};

module.exports = {
  usePromoCode,
  validatePromoCode


};