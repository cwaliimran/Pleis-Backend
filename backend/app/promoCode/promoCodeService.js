const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const promoCodeRepo = require("./promoCodeRepository");


const usePromoCode = async (data) => {
  let promoCode = await promoCodeRepo.usePromoCode(data);
  return promoCode;
};

module.exports = {
  usePromoCode,


};