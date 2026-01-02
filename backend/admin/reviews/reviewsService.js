
const reviewRepo = require("./reviewsRepository");


const getReviews = async (data) => {
  let {reviews, meta} = await reviewRepo.getReviews(data);
  return {reviews, meta};
};
const updateReviews = async (id, data) => {
  const promoCode = await reviewRepo.findReviewById(id);
  if (!promoCode) {
    return { error: "PromoCode_not_found" };
  }


  // -----------------------------
  // ALLOWED FIELDS
  // -----------------------------
  const allowedFields = [
    "comment",
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
    return promoCode;
  }

  Object.assign(promoCode, updateData);
  await promoCode.save();

  return promoCode;
};
  const deleteReview = async (id) => {
      const updated = await reviewRepo.findByIdAndUpdate(id, {
        status: "deleted",
      });
      if (!updated) return null;
      return true;
    };
module.exports = {
  getReviews,
updateReviews,
deleteReview

};