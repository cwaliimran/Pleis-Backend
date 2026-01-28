const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const reviewsRepo = require("./reviewsRepository");


const createReviews = async (data) => {
  let reviews = await reviewsRepo.createReviews(data);
  return reviews;
};
const getReviews = async ({ organizationId, timezone, page = 1, limit = 10, keyword, status, userId, date, range }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { reviews, meta } = await reviewsRepo.getReviews({ organizationId, timezone, page, limit, keyword, status, userId, date, range, today, skip });

  return {
    reviews,
    meta
  };
};







const getRatingsByEventIdService = async (eventId,userId) => {
  let ratings = await reviewsRepo.getRatingsByEventId(eventId,userId);
  return ratings;
}


module.exports = {
  createReviews,
  getReviews,
  getRatingsByEventIdService


};