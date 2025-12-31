const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const promoCodeRepo = require("./reviewsRepository");


const getReviews = async (data) => {
  let reviews = await promoCodeRepo.getReviews(data);
  return reviews;
};

module.exports = {
  getReviews,


};