const { buildKeywordQueryFromModels } = require("@dbUtils/queryUtil");
const Promotion = require("@PromotionModel");
const repository = require("./promotionsRepository");
const { generateMeta } = require("@utils/responseUtil");
const formatPromotion = require("./utils/formatPromotion");
const { getUserWallet } = require("../../userWalletService/global/walletManagement/userWalletService");


const getGlobalPromotionsService = async ({
  userId,
  page,
  limit,
  skip,
  keyword,
  timezone
}) => {
  const now = new Date();

  // ---------------------------
  // 1️⃣ Base query
  // ---------------------------
  const query = {
    status: "active",
    $or: [
      { endDate: null },
      { endDate: { $gte: now } }
    ]
  };

  if (keyword) {
    const keywordMatch = buildKeywordQueryFromModels(
      [{ schema: Promotion.schema }],
      keyword
    );
    Object.assign(query, keywordMatch);
  }

  // ---------------------------
  // 2️⃣ Parallel execution
  // ---------------------------
  const [
    wallet,
    records,
    totalFiltered
  ] = await Promise.all([
    getUserWallet(userId),
    repository.getWithFilters(query, skip, limit),
    Promotion.countDocuments(query)
  ]);

  // ---------------------------
  // 3️⃣ Wallet values
  // ---------------------------
  const userTierEntry =
    wallet?.global?.level?.entryPoints ?? 0;

  const userGlobalPoints =
    wallet?.global?.points ?? 0;

  // ---------------------------
  // 4️⃣ Eligibility evaluation
  // ---------------------------
  const responses = records.map(promo => {
    const requiredTierEntry =
      promo?.tierLimit?.entryPoints ?? 0;

    let eligible = userTierEntry >= requiredTierEntry;

    // Balance check ONLY for claim promotion
    if (
      eligible &&
      promo.promotionType === "globalClaimPromotion"
    ) {
      const requiredPoints = promo.claimPoints ?? 0;
      eligible = userGlobalPoints >= requiredPoints;
    }

    return {
      ...formatPromotion(promo, timezone),
      eligible
    };
  });

  // ---------------------------
  // 5️⃣ Meta
  // ---------------------------
  const meta = generateMeta(page, limit, totalFiltered);

  return {
    responses,
    meta
  };
};



const getDetails = async (id, timezone) => {
  let item = await repository.findById(id);
  //format item
  if (item) {
    item = formatPromotion(item.toObject(), timezone);
  }
  return item;
};

const getGlobalPromotionsForHomeService = async ({
  userId,
  limit = 10,
  skip = 0,
  timezone
}) => {
  const now = new Date();

  /* ===============================
     1️⃣ Base query (home-safe)
     =============================== */
  const query = {
    status: "active",
    $or: [
      { endDate: null },
      { endDate: { $gte: now } }
    ]
  };

  /* ===============================
     2️⃣ Fetch wallet + promotions
     =============================== */
  const [wallet, records] = await Promise.all([
    getUserWallet(userId),
    repository.getWithFilters(query, skip, limit)
  ]);

  /* ===============================
     3️⃣ Wallet values
     =============================== */
  const userTierEntry =
    wallet?.global?.level?.entryPoints ?? 0;

  const userGlobalPoints =
    wallet?.global?.points ?? 0;

  /* ===============================
     4️⃣ Eligibility evaluation
     =============================== */
  const responses = records.map(promo => {
    const requiredTierEntry =
      promo?.tierLimit?.entryPoints ?? 0;

    let eligible = userTierEntry >= requiredTierEntry;

    // Balance check ONLY for claim promotions
    if (
      eligible &&
      promo.promotionType === "globalClaimPromotion"
    ) {
      const requiredPoints = promo.claimPoints ?? 0;
      eligible = userGlobalPoints >= requiredPoints;
    }

    return {
      ...formatPromotion(promo, timezone),
      eligible
    };
  });

  /* ===============================
     5️⃣ Home response (no meta)
     =============================== */
  return {
    responses
  };
};


module.exports = {
  getGlobalPromotionsService,
  getDetails,
  getGlobalPromotionsForHomeService
};
