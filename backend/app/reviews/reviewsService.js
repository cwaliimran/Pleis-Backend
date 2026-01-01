const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const promoCodeRepo = require("./reviewsRepository");


const createReviews = async (data) => {
  let reviews = await promoCodeRepo.createReviews(data);
  return reviews;
};
const getReviews = async ({ organizationId, timezone, page = 1, limit = 10, keyword, status, userId, date, range }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { reviews, meta } = await promoCodeRepo.getReviews({ organizationId, timezone, page, limit, keyword, status, userId, date, range, today, skip });

  return {
    reviews,
    meta
  };
};
module.exports = {
  createReviews,
  getReviews


};