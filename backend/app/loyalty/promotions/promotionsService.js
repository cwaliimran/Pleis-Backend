const repository = require("./promotionsRepository");
const { generateMeta, getCurrentDateInTimezone } = require("@utils/responseUtil");
const formatPromotion = require("../../../commonModules/loyalty/promotions/utils/formatPromotion");

const getPromotions = async ({
  userId,
  page,
  limit,
  keyword,
  timezone,
}) => {
  const now = getCurrentDateInTimezone({ timezone });

  return repository.getPromotions({
    userId,
    page,
    limit,
    keyword,
    timezone,
    now,
  });
};



const getPromotionsForHome = async ({
  userId,
  page = 1,
  limit = 11,
  timezone,
}) => {
  const now = getCurrentDateInTimezone({ timezone });

  return repository.getPromotionsForHome({
    userId,
    page,
    limit,
    timezone,
    now,
  });
};


const getDetails = async ({
  id,
  userId,
  timezone,
}) => {
  const now = getCurrentDateInTimezone({ timezone });

  return repository.findById({
    id,
    userId,
    timezone,
    now,
  });
};



const getPromotionsByCompanyOrganizerService = async ({
  userId,
  page,
  limit,
  timezone,
  companyOrganizer,
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const now = getCurrentDateInTimezone({ timezone });

  const promotions =
    await repository.getPromotionsByCompanyOrganizer({
      skip,
      limit,
      now,
      companyOrganizer,
      userId,
      timezone,
    });

  const totalFiltered = await repository.count({
    status: "active",
    companyOrganizer,
    endDate: { $gte: now },
  });

  const meta = generateMeta(page, limit, totalFiltered);

  return { promotions, meta };
};

const claimPromotion = async (promotionId, userId, timezone) => {
  const promotion = await repository.claimPromotion(promotionId, userId);
  if (!promotion) return null;

  return promotion;
};

module.exports = {
  getPromotions,
  getDetails,
  getPromotionsByCompanyOrganizerService,
  getPromotionsForHome,
  claimPromotion
};
