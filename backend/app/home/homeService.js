
const { getBannerControls } = require("../../admin/bannerControl/bannerControlsService");
const { getTop10Promos } = require("../../admin/browserControl/top10PromoSection/topPromosService");
const { getPublicCategories } = require("../../admin/categories/categoriesService");
const { getCustomCategories } = require("../../admin/customCategories/customCategoriesService");
const { getNearbyEvents } = require("../../commonModules/events/eventService");
const { Highlights } = require("../../commonModules/highlights/Highlight");
const { getPublicHighlights } = require("../../commonModules/highlights/highlightService");
const { index } = require("../../commonModules/loyalty/challenges/models/Reward/rewardSchema");

const getHomeService = async ({ queryData }) => {
  const { timezone } = queryData;
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
      topPicks,
      loyaltyEvents,
      challenges,
      promotions,
    ] = await Promise.all([
      getPublicCategories({}),
      getTop10Promos({ timezone }),
      getBannerControls({ page: 1, limit: 10, status: "active" }),
      [],//getForYou({ page: 1, limit: 10, status: "active" }),
      getNearbyEvents(queryData),
      getCustomCategories({ timezone, page: 1, limit: 10, status: "active" }),
      getPublicHighlights({ page: 1, limit: 10, keyword: "" }),
      [],//getTopPicks({ page: 1, limit: 10, status: "active" }),
      [],//getLoyaltyEvents({ page: 1, limit: 10, status: "active" }),
      [],//getChallenges({ page: 1, limit: 10, status: "active" }),
      [],//getPromotions({ page: 1, limit: 10, status: "active" }),
    ]);

    // Normalize all fetched data
    const categories = categoriesRes?.categories || [];
    const banners = bannersRes?.bannerControls || [];
    const customCategories = customCategoriesRes?.customCategories || [];

    const highlights = Array.isArray(highlightsRes?.highlights)
      ? highlightsRes.highlights.map((h) => new Highlights(h).toCustomJSON(h))
      : [];

    // Define section structure and order — uses static titles and includes dynamic (customCategory)
    const sectionOrder = [
      { key: "categories", title: "Categories", data: categories },
      { key: "top10", title: "Top 10", data: top10 },
      { key: "forYou", title: "For You", data: forYou },
      { key: "nearYou", title: "Near You", data: nearYou },
      { key: "banners", title: "Banners", data: banners, index: 0 },
      { key: "customCategory", title: "Custom Category", index: 0 },
      { key: "topPicks", title: "Top Picks", data: topPicks },
      { key: "highlights", title: "Highlights", data: highlights },
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
    console.error("getHomeService error:", error);
    return { status: false, data: error.message || error };
  }
};



module.exports = {
  getHomeService,
};
