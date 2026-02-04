const { buildKeywordQueryFromModels } =
  require("@dbUtils/queryUtil");

const Promotion =
  require("@PromotionModel");

const repository =
  require("./promotionsRepository");

const { generateMeta } =
  require("@utils/responseUtil");

/* ==========================================================
   GLOBAL PROMOTIONS LIST
========================================================== */
const getGlobalPromotionsService = async ({
  userId,
  page,
  limit,
  skip,
  keyword,
  timezone,
}) => {
  const now = new Date();

  /* ---------------------------
     Base query
  --------------------------- */
  const query = {
    status: "active",
    $or: [
      { endDate: null },
      { endDate: { $gte: now } },
    ],
  };

  if (keyword) {
    const keywordMatch =
      buildKeywordQueryFromModels(
        [{ schema: Promotion.schema }],
        keyword
      );

    Object.assign(query, keywordMatch);
  }

  /* ---------------------------
     Fetch records + count
  --------------------------- */
  const [records, totalFiltered] =
    await Promise.all([
      repository.getWithFilters(
        query,
        skip,
        limit
      ),
      Promotion.countDocuments(query),
    ]);

  /* ---------------------------
     Eligibility via repo
  --------------------------- */
  const responses =
    await repository.applyEligibility({
      promotions: records,
      userId,
      timezone,
      now,
    });

  /* ---------------------------
     Meta
  --------------------------- */
  const meta = generateMeta(
    page,
    limit,
    totalFiltered
  );

  return {
    responses,
    meta,
  };
};

/* ==========================================================
   PROMOTION DETAILS
========================================================== */
const getDetails = async (
  id,
  timezone,
  userId
) => {
  const now = new Date();

  const item =
    await repository.findById(id);

  if (!item) return null;

  const [eligibleItem] =
    await repository.applyEligibility({
      promotions: [item],
      userId,
      timezone,
      now,
    });

  return eligibleItem;
};

/* ==========================================================
   HOME PROMOTIONS
========================================================== */
const getGlobalPromotionsForHomeService =
  async ({
    userId,
    limit = 10,
    skip = 0,
    timezone,
  }) => {
    const now = new Date();

    /* Base query */
    const query = {
      status: "active",
      $or: [
        { endDate: null },
        { endDate: { $gte: now } },
      ],
    };

    const records =
      await repository.getWithFilters(
        query,
        skip,
        limit
      );

    const responses =
      await repository.applyEligibility({
        promotions: records,
        userId,
        timezone,
        now,
      });

    return {
      responses,
    };
  };

module.exports = {
  getGlobalPromotionsService,
  getDetails,
  getGlobalPromotionsForHomeService,
};
