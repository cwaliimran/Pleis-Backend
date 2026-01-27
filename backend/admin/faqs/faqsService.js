const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const FaqsRepo = require("./faqsRepository");
const { cache, invalidate } = require("@redisCache");
const ACTIVE_ADMIN_SETTINGS_CACHE_KEY = "adminSettings:active";
const buildAdminSettingsCacheKey = ({
  scope = "public", // public | admin
  skip = 0,
  limit = 10
}) => {
  return `${ACTIVE_ADMIN_SETTINGS_CACHE_KEY}:${scope}:skip=${skip}:limit=${limit}`;
};
const invalidateAdminSettingsScope = async (scope) => {
  await invalidate(`${ACTIVE_ADMIN_SETTINGS_CACHE_KEY}:${scope}`);
};

const createFaqs = async (data) => {
  let Faqs = await FaqsRepo.createFaqs(data);
  return Faqs;
};
const getFaqss = async ({ timezone, page, limit, keyword, status, userId, date, range }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { Faqss, meta } = await FaqsRepo.getFaqss({ timezone, page, limit, keyword, status, userId, date, range, today, skip });

  return {
    Faqss,
    meta
  };
};
const updateFaqs = async (id, data) => {
  const invalidations = [];
  invalidations.push("faqs");
  await Promise.all(
    invalidations.map((scope) => invalidateAdminSettingsScope(scope))
  );
  const Faqs = await FaqsRepo.findFaqsById(id);
  if (!Faqs) {
    return { error: "PromoCode_not_found" };
  }

  // -----------------------------
  // VALIDATIONS
  // -----------------------------

  if (data.discountType) {
    if (Faqs.discountType !== data.discountType) {
      if (!data.discountValue) {
        return { error: "discountValue_is_required_when_discountType_changes" };
      }
    }
  }

  // -----------------------------
  // ALLOWED FIELDS
  // -----------------------------
  const allowedFields = [
    "question",
    "answer",
    "type",
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
    return Faqs;
  }

  Object.assign(Faqs, updateData);
  await Faqs.save();

  return Faqs;
};





const deleteFaqs = async (id) => {
  if (!id) throw new Error("FAQ ID is required");

  const deleted = await FaqsRepo.deleteFaq(id);
  return !!deleted;
};


module.exports = {
  createFaqs,
  getFaqss,
  updateFaqs,
  deleteFaqs,

};