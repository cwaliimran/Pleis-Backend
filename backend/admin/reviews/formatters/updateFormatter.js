const { getFullImageUrl } = require("../../../helperUtils/imageHelper");

function formatReviewData(review) {
  if (!review) return null;

  const formattedReview = {
    ...review,
    userDetails: {
      ...review.userDetails,
      profileIcon: getFullImageUrl(review.userDetails?.profileIcon || "noimage.png"),  // Format user profile image
    },
    organizationDetails: {
      ...review.organizationDetails,
      basicInfo: {
        ...review.organizationDetails.basicInfo,
        media: {
          logo: getFullImageUrl(review.organizationDetails?.basicInfo?.media?.logo || "noimage.png"),  // Format organization logo image
          cover: getFullImageUrl(review.organizationDetails?.basicInfo?.media?.cover || "noimage.png"),  // Format organization cover image
        },
      },
    },
  };

  return formattedReview;
}
module.exports = { formatReviewData };