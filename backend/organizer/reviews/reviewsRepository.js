const Reviews  = require('@ReviewsModel'); // Adjust path to your PromoCode model

const getReviews = async (data) => {
  try {
    const reviews = await Reviews.get(data);
    return reviews;

  } catch (err) {
    throw err;
  }
};

module.exports = {
  getReviews,
};
