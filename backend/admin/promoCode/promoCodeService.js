const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const promoCodeRepo = require("./promoCodeRepository");


const createPromoCode = async (data) => {
  let promoCode = await promoCodeRepo.createPromoCode(data);
  return promoCode;
};
const getPromoCodes = async ({ timezone, page, limit, keyword, status, userId,  date, range }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { promoCodes, meta } = await promoCodeRepo.getPromoCodes({ timezone, page, limit, keyword, status, userId,  date, range, today, skip });

  return {
    promoCodes,
    meta
  };
};
const updatePromoCode = async (id, data) => {
  const promoCode = await promoCodeRepo.findPromoCodeById(id);
  if (!promoCode) {
    return { error: "PromoCode_not_found" };
  }

  // -----------------------------
  // VALIDATIONS
  // -----------------------------

  if(data.discountType){
  if (promoCode.discountType !== data.discountType) {
      if (!data.discountValue) {
        return { error: "discountValue_is_required_when_discountType_changes" };
  }
}
}

  // -----------------------------
  // ALLOWED FIELDS
  // -----------------------------
  const allowedFields = [
    "title",
    "promoCode",
    "description",
    "discountType",
    "discountValue",
    "status",
    "maxDiscountCap",
    "maxCountPerUser",
    "expiryDate",
    "maxUsage",
  ];

if(data.expiryDate=="Invalid date"){
    delete data.expiryDate;
}

  // -----------------------------
  // APPLY UPDATE FIELDS
  // -----------------------------
  const updateData = {};
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }
console.log("updateData", updateData );
  if (Object.keys(updateData).length === 0) {
    return promoCode;
  }

  Object.assign(promoCode, updateData);
  await promoCode.save();

  return promoCode;
};





  const deletePromoCode = async (id) => {
      const updated = await promoCodeRepo.findByIdAndUpdate(id, {
        status: "deleted",
      });
      if (!updated) return null;
      return true;
    };

module.exports = {
  createPromoCode,
  getPromoCodes,
  updatePromoCode,
  deletePromoCode,

};