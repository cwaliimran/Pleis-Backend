const { default: mongoose } = require("mongoose");
const {
  Promotion,
} = require("../../../commonModules/loyalty/promotions/models/Promotion");


const clubMemberRepo = require("../clubMembers/clubMembersRepository");
const { formatUserWallet } = require("../clubMembers/formatters/formatUserWallet");
// const formatPromotion = require("./utils/formatPromotion");
const { generateMeta } = require("@utils/responseUtil");
const formatPromotion = require("./formatters/formatPromotion");


// Get promotions with population
const getWithFilters = async (query = {}, skip = 0, limit = 10) => {
  return Promotion.find(query)
    .populate("menuItem")
    .populate("tierLimit")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
};

// Count
const count = async (query = {}) => {
  return Promotion.countDocuments(query);
};

// Find by ID with population
const findById = async (id) => {
  return Promotion.findById(id)
    .populate("menuItem")
    .populate("tierLimit");
};

const getPromotionsByCompanyOrganizer = async ({
  skip,
  limit,
  now,
  companyOrganizer,
}) => {
  const match = {
    status: "active",
    companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
    endDate: { $gte: now }, // Only future OR running promotions
  };

  return Promotion.find(match)
    .populate({
      path: "companyOrganizer",
      select: "companyDetails.name firstName profileIcon",
    })
    .populate("menuItem")
    .populate("tierLimit")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit).lean().exec();
};

/**
 * Promotions for Loyalty Dashboard
 * Organizer-scoped, tier-aware, recurrence-safe
 */
const getPromotionsForDashboard = async ({
  userId,
  timezone,
  page = 1,
  limit = 10
}) => {
  const now = new Date();
  const skip = (page - 1) * limit;

  // 1️⃣ Clubs user follows
  const clubIds = await clubMemberRepo.getFollowedClubIds(userId);
  if (!clubIds.length) {
    return { items: [], meta: generateMeta(page, limit, 0) };
  }


  // 2️⃣ Wallets per club (tier + points)
  const wallets = await Promise.all(
    clubIds.map(org => clubMemberRepo.getWallet(userId, org))
  );

  const walletMap = new Map();
  wallets.forEach(w => {
    const fw = formatUserWallet(w);
    walletMap.set(String(fw.companyOrganizer), fw);
  });

  // 3️⃣ Fetch promotions (DB-level pagination)
  const promotions = await Promotion.find({
    companyOrganizer: { $in: clubIds },
    status: "active",
    $or: [
      { startDate: null, endDate: null },
      { startDate: { $lte: now }, endDate: { $gte: now } }
    ]
  })
    .populate("tierLimit")
    .populate("companyOrganizer", "companyDetails.loyaltySettings.title profileIcon")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  // 4️⃣ Eligibility + formatting
  const eligible = [];

  for (const promo of promotions) {
    const wallet = walletMap.get(String(promo.companyOrganizer._id));
    if (!wallet) continue;

    // Tier check
    const tierKey = wallet.tierKey || "essential";
    const requiredTierEntry = promo?.tierLimit?.[tierKey]?.entryPoints ?? 0;
    const userTierEntry = wallet?.level?.entryPoints ?? 0;

    if (userTierEntry < requiredTierEntry) continue;

    // PromotionType-specific guards
    if (
      promo.promotionType === "claimPromotion" &&
      wallet.points < promo.claimPoints
    ) {
      continue;
    }

    eligible.push(formatPromotion(promo, timezone, wallet.tierKey));
  }

  return {
    items: eligible,
    meta: generateMeta(page, limit, eligible.length)
  };
};

module.exports = {
  getWithFilters,
  count,
  findById,
  getPromotionsByCompanyOrganizer,
  getPromotionsForDashboard

};
