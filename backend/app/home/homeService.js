
const { getBannerControls } = require("../../admin/bannerControl/bannerControlsService");
const { getPublicHighlights } = require("../highlights/highlightService");
const { getUserRecentlyViewedItems } = require("../recentlyViewed/recentlyViewedItemService");
const { sendResponse } = require("../../helperUtils/responseUtil");
const { getCustomCategories } = require("../customCategories/customCategoriesService");
const { getNearbyEvents, getForYouEvents } = require("../events/eventService");
const { getChallenges } = require("../loyalty/challenges/challengesService");
const { getPromotions } = require("../loyalty/promotions/promotionsService");
const { getPublicCategories } = require("../publicCategories/categoriesService");
const { getTop10Promos } = require("../top10PromoSection/topPromosService");

const getHomeService = async ({ queryData }) => {
  const { userId, userLocation, timezone } = queryData;

  try {
    // Fetch all data in parallel
    const [
      categoriesRes,
      top10,
      bannersRes,
      forYou,
      nearYou,
      customCategoriesRes,
      highlightsRes,
      recentlyViewed,
      topPicks,
      loyaltyEvents,
      challenges,
      promotions,
    ] = await Promise.all([
      getPublicCategories({}),
      getTop10Promos({ userLocation, userId, timezone }),
      getBannerControls({ page: 1, limit: 10, status: "active" }),
      getForYouEvents(userId, userLocation, timezone),
      getNearbyEvents(queryData),
      getCustomCategories({ userLocation, userId, timezone, page: 1, limit: 10, status: "active" }),
      getPublicHighlights({ userId, page: 1, limit: 10, keyword: "", userLocation }),
      getUserRecentlyViewedItems({
        userId,
        location: userLocation,
        timezone,
        targetType: "event", //fetch only events for home screen
        page: 1,
        limit: 10,
      }),
      [],//getTopPicks({ page: 1, limit: 10, status: "active" }),
      [],//getLoyaltyEvents({ page: 1, limit: 10, status: "active" }),
      getChallenges({ page: 1, limit: 10, timezone }),
      getPromotions({ page: 1, limit: 10, timezone }),
    ]);

    // Normalize all fetched data
    const categories = categoriesRes?.categories || [];
    const banners = bannersRes?.bannerControls || [];
    const customCategories = customCategoriesRes?.customCategories || [];

    const highlights = highlightsRes?.highlights || [];

    // Define section structure and order — uses static titles and includes dynamic (customCategory)
    const sectionOrder = [
      { key: "categories", title: "Categories", data: categories },
      { key: "top10", title: "Top 10", data: top10 },
      { key: "forYou", title: "For You", data: forYou.data || [] },
      { key: "nearYou", title: "Near You", data: nearYou },
      { key: "banners", title: "Banners", data: banners, index: 0 },
      { key: "customCategory", title: "Custom Category", index: 0 },
      { key: "topPicks", title: "Top Picks", data: topPicks },
      { key: "highlights", title: "Highlights", data: highlights },
      { key: "recentlyViewed", title: "Recently Viewed", data: recentlyViewed?.recentlyViewedItems || [] },
      { key: "customCategory", title: "Custom Category", index: 1 },
      { key: "banners", title: "Banners", data: banners, index: 1 },
      { key: "loyaltyEvents", title: "Loyalty Events", data: loyaltyEvents },
      { key: "customCategory", title: "Custom Category", index: 2 },
      { key: "challenges", title: "Challenges", data: challenges },
      { key: "customCategory", title: "Custom Category", index: 3 },
      { key: "banners", title: "Banners", data: banners, index: 2 },
      { key: "promotions", title: "Promotions", data: promotions },
    ];

    // Build final ordered sections
    const interleavedSections = sectionOrder.reduce((acc, section) => {
      if (section.key === "customCategory") {
        const cat = customCategories[section.index];
        if (cat?.objects?.length) {
          acc.push({
            key: "customCategory",
            title: cat.title || `Dynamic Section ${section.index + 1}`,
            objects: cat.objects,
          });
        }
      } else if (section.key === "banners") {
        const banner = banners[section.index];
        if (banner) {
          acc.push({
            key: "banners",
            title: "Banners",
            data: banner,
          });
        }
      }
      else if (section.key === "nearYou") {
        //only add nearYou section if data is available
        acc.push({
          key: section.key,
          title: section.title,
          data: section.data?.events || [],
        });
      } else
      //if (Array.isArray(section.data) && section.data.length)  //enable it only if you want to skip empty sections
      {
        acc.push({
          key: section.key,
          title: section.title,
          data: section.data,
        });
      }
      return acc;
    }, []);
    // Fill up to 30 sections with remaining custom categories (if any)
    // Insert a banner after every 4 customCategory if available
    let bannerInsertIndex = 0;
    for (
      let i = interleavedSections.length;
      i < 30 && i - sectionOrder.length < customCategories.length;
      i++
    ) {
      const extra = customCategories[i - sectionOrder.length];
      if (extra?.objects?.length) {
        interleavedSections.push({
          key: "customCategory",
          title: extra.title || `Dynamic Section ${i + 1}`,
          objects: extra.objects,
        });
        // After every 4th customCategory, insert a banner if available
        if ((interleavedSections.filter(s => s.key === "customCategory").length) % 4 === 0 && banners[bannerInsertIndex]) {
          interleavedSections.push({
            key: "banners",
            title: "Banners",
            data: banners[bannerInsertIndex],
          });
          bannerInsertIndex++;
        }
      } else break;
    }
    return { status: true, data: interleavedSections };
  } catch (error) {
    return sendResponse({
      statusCode: 500,
      translationKey: "internal_server",
      error: error,
    });
  }
};



module.exports = {
  getHomeService,
};
