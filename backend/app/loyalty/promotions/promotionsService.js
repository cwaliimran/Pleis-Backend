const repository = require("./promotionsRepository");
const { getActivePromotionMatchQuery } = require("../../../commonModules/loyalty/promotions/utils/promotionSchedule");
const { generateMeta, getCurrentDateInTimezone } = require("@utils/responseUtil");
const formatPromotion = require("../../../commonModules/loyalty/promotions/utils/formatPromotion");
const { addEngagementEvent } = require("@appEngagement/engagementEventsRepository");

const getPromotions = async ({
  userId,
  page,
  limit,
  keyword,
  timezone,
  companyOrganizer,
}) => {
  const now = getCurrentDateInTimezone({ timezone });

  return repository.getPromotions({
    userId,
    page,
    limit,
    keyword,
    timezone,
    now,
    companyOrganizer,
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
  companyOrganizer,
}) => {
  const now = getCurrentDateInTimezone({ timezone });
    addEngagementEvent({
      entityType: "promotions",
      entityId: id,
      action: "view",
      userId: userId,
    });

  return repository.findById({
    id,
    userId,
    timezone,
    now,
    companyOrganizer,
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
    ...getActivePromotionMatchQuery(timezone, now),
  });

  const meta = generateMeta(page, limit, totalFiltered);

  return { promotions, meta };
};

const claimPromotion = async (promotionId, userId, timezone) => {
  const promotion = await repository.claimPromotion(promotionId, userId, timezone);
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
