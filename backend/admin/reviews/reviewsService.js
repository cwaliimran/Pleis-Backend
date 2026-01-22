
const { sendUserNotifications } = require("@notificationsUtil");
const { getOrgCompanyOrganizer } = require("../organizations/organizationRepository");
const reviewRepo = require("./reviewsRepository");
const { NotificationTypes } = require("@NotificationsModel");


const getReviews = async (data) => {
  let { reviews, meta } = await reviewRepo.getReviews(data);
  return { reviews, meta };
};
const updateReviews = async (id, data) => {
  const review = await reviewRepo.findReviewById(id);
  if (!review) {
    return { error: "review_not_found" };
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
    return review;
  }

  Object.assign(review, updateData);
  await review.save();
  const companyOrganizer = await getOrgCompanyOrganizer(review.organization);
  await sendUserNotifications({
    recipientIds: [review.user.toString()],
    title: `there is an update on your review`,
    body: `The admin responded to your review.`,
    data: { type: NotificationTypes.REVIEW_UPDATED, reviewId: review._id, objectType: "reviews" },
    sender: companyOrganizer,
    objectId: review._id,
    image: null,

  });

  return review;
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