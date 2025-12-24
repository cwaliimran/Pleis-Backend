const mongoose = require("mongoose");

const Organizations = require("@OrganizationModel");
const { Events } = require("@EventsModel");
const { User } = require("@UserModel");
const Promotion = require("@PromotionModel");
const {Highlights} = require("@HighlightsModel");

const MAX_DISTANCE_KM = 50;
const MAX_LIMIT = 100;

// ----------------------------------------------------
// Helpers
// ----------------------------------------------------
const buildGeoQuery = (coordinates, radiusKm = MAX_DISTANCE_KM) => {
    if (!coordinates || coordinates.length !== 2) return {};

    return {
        location: {
            $nearSphere: {
                $geometry: {
                    type: "Point",
                    coordinates
                },
                $maxDistance: radiusKm * 1000 // meters
            }
        }
    };
};

const applyCategoryFilter = (field, category) => {
    if (!category) return {};
    return {
        [field]: category
    };
};

// ----------------------------------------------------
// ORGANIZERS
// ----------------------------------------------------
const fetchOrganizers = async ({
    location,
    radiusKm,
    category
}) => {
    const query = {
        status: "active",
        ...buildGeoQuery(location, radiusKm),
        ...applyCategoryFilter("otherInfo.categories", category)
    };

    return Organizations.find(query)
        .select({
            publicId: 1,
            basicInfo: 1,
            location: 1,
            meta: 1,
            operatingHours: 1,
            createdAt: 1,
            otherInfo: 1
        })
        .limit(MAX_LIMIT)
        .lean();
};

// ----------------------------------------------------
// EVENTS
// ----------------------------------------------------
const fetchEvents = async ({
    location,
    radiusKm,
    category,
    timezone
}) => {
    const now = new Date();

    const query = {
        status: "active",
        startDate: { $gte: now },
        ...buildGeoQuery(location, radiusKm),
        ...(category && { categories: category })
    };

    return Events.find()
        .select({
            title: 1,
            location: 1,
            startDate: 1,
            endDate: 1,
            stats: 1,
            organizer: 1,
            categories: 1
        })
        .populate("organizer", "basicInfo.name location")
        .limit(MAX_LIMIT)
        .lean();
};

// ----------------------------------------------------
// LOYALTY CLUBS
// ----------------------------------------------------
const fetchLoyaltyClubs = async ({
    userId,
    category
}) => {
    const query = {
        status: "active",
        ...(category && { categories: category }),
        ...(userId && { members: { $ne: userId } }) // exclude joined clubs
    };

    return User.find(query)
        .select({
            title: 1,
            stats: 1,
            organization: 1,
            createdAt: 1
        })
        .populate("organization", "basicInfo location meta")
        .limit(MAX_LIMIT)
        .lean();
};

// ----------------------------------------------------
// PROMOTIONS
// ----------------------------------------------------
const fetchPromotions = async ({
    userId,
    category
}) => {
    const now = new Date();

    const query = {
        status: "active",
        $or: [{ endDate: null }, { endDate: { $gte: now } }],
        ...(category && { categories: category })
    };

    return Promotion.find(query)
        .select({
            title: 1,
            reward: 1,
            tierLimit: 1,
            createdAt: 1
        })
        .populate("reward")
        .populate("tierLimit", "type entryPoints")
        .limit(MAX_LIMIT)
        .lean();
};

// ----------------------------------------------------
// HIGHLIGHTS
// ----------------------------------------------------
const fetchHighlights = async ({
    category
}) => {
    const query = {
        status: "active",
        ...(category && { categories: category })
    };

    return Highlights.find(query)
        .select({
            title: 1,
            media: 1,
            organization: 1,
            categories: 1
        })
        .populate("organization", "basicInfo location")
        .limit(MAX_LIMIT)
        .lean();
};


const getBannerControlsForHome = async ({ page, limit, keyword, status, date, orderSort = "asc",category }) => {
  const query = {};
  // Filter by status
  query.status = status ? status : { $ne: "deleted" };

  // Date filter (format: yyyy-mm-dd)
  if (date) {
    query.createdAt = {
      $gte: new Date(date),
      $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
    };
  }


  const sort = { order: orderSort === "desc" ? -1 : 1 };

  let [bannerControls, getBannerControlsCounts] = await Promise.all([
    bannerControlsRepo.getBannerControlsWithFilters(query, page, limit === 0 ? 0 : limit, sort),
    bannerControlsRepo.getBannerControlsCounts(query),
  ]);

  //format bannerControls
  bannerControls = bannerControls.map(item => {
    return formatBannerObject(item);
  });

  const { totalFiltered, total, active, inactive } = getBannerControlsCounts;
  const meta = generateMeta(page, limit, totalFiltered);
  meta.bannerControlsCount = { total, active, inactive };

  return { bannerControls, meta };
};

// ----------------------------------------------------
module.exports = {
    fetchOrganizers,
    fetchEvents,
    fetchLoyaltyClubs,
    fetchPromotions,
    fetchHighlights,
};
