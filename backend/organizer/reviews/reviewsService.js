const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const promoCodeRepo = require("./reviewsRepository");


const getReviews = async (data) => {
  let {data1,meta} = await promoCodeRepo.getReviews(data);
  return {data1, meta};
};

module.exports = {
  getReviews,


};