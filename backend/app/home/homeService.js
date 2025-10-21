
const { getBannerControls } = require("../../admin/bannerControl/bannerControlsService");
const { getTop10Promos } = require("../../admin/browserControl/top10PromoSection/topPromosService");
const { getPublicCategories } = require("../../admin/categories/categoriesService");
const { getCustomCategories } = require("../../admin/customCategories/customCategoriesService");
const { Highlights } = require("../../commonModules/highlights/Highlight");
const { getPublicHighlights } = require("../../commonModules/highlights/highlightService");

const getHomeService = async () => {
  try {
    // Fetching all static and dynamic data in parallel for efficiency
    let [
      categories,
      promotedEvents,
      banners,
      forYou,
      nearYou,
      customCategories,
      highlights,
      topPicks,
      loyaltyEvents,
      challenges,
      promotions,
    ] = await Promise.all([
      getPublicCategories({}),
      getTop10Promos({}),
      getBannerControls({ page: 1, limit: 10, status: "active" }),
      [], // getForYou({ page: 1, limit: 10, status: "active" }),
      [], // getNearYou({ page: 1, limit: 10, status: "active" }),
      getCustomCategories({ page: 1, limit: 10, status: "active" }),
      getPublicHighlights({ page: 1, limit: 10, keyword: "" }),
      [], // getTopPicks({ page: 1, limit: 10, status: "active" }),
      [], // getLoyaltyEvents({ page: 1, limit: 10, status: "active" }),
      [], // getChallenges({ page: 1, limit: 10, status: "active" }),
      [], // getPromotions({ page: 1, limit: 10, status: "active" }),
    ]);

    // Format highlights
    if (!highlights || !Array.isArray(highlights.highlights) || highlights.highlights.length === 0) {
      highlights = [];
    } else {
      highlights = highlights.highlights.map((highlight) => {
        return new Highlights(highlight).toCustomJSON(highlight);
      });
    }

    // Prepare static sections
    const staticSections = [
      { key: "categories", data: categories?.categories || [] },
      { key: "promotedEvents", data: promotedEvents || [] },
      { key: "banners", data: banners?.bannerControls || [] },
      { key: "forYou", data: forYou || [] },
      { key: "nearYou", data: nearYou || [] },
      { key: "topPicks", data: topPicks || [] },
      { key: "highlights", data: highlights || [] },
      { key: "loyaltyEvents", data: loyaltyEvents || [] },
      { key: "challenges", data: challenges || [] },
      { key: "promotions", data: promotions || [] },
    ];

    // Insert dynamic sections (custom categories) at the specified positions
    const interleavedSections = [];
    const sectionOrder = [
      { staticKey: "categories", dynamicIndex: null },
      { staticKey: "promotedEvents", dynamicIndex: null },
      { staticKey: "banners", dynamicIndex: null },
      { staticKey: "forYou", dynamicIndex: null },
      { staticKey: "nearYou", dynamicIndex: null },
      { staticKey: "customCategory", dynamicIndex: 0 }, // Custom Category from index 0
      { staticKey: "topPicks", dynamicIndex: null },
      { staticKey: "highlights", dynamicIndex: null },
      { staticKey: "customCategory", dynamicIndex: 1 }, // Custom Category from index 1
      { staticKey: "loyaltyEvents", dynamicIndex: null },
      { staticKey: "customCategory", dynamicIndex: 2 }, // Custom Category from index 2
      { staticKey: "challenges", dynamicIndex: null },
      { staticKey: "customCategory", dynamicIndex: 3 }, // Custom Category from index 3
      { staticKey: "promotions", dynamicIndex: null },
    ];

     // Add static sections and interleave with dynamic custom categories
    let dynamicCategoryIndex = 0;

    sectionOrder.forEach((section) => {
      // Check if there is a dynamic section to insert
      if (section.dynamicIndex !== null && dynamicCategoryIndex < customCategories.customCategories.length) {
        const customCategory = customCategories.customCategories[dynamicCategoryIndex];
        // Ensure custom category has valid objects (events data)
        if (customCategory && customCategory.objects && customCategory.objects.length > 0) {
          interleavedSections.push({
            key: "customCategory", // Use a generic key for dynamic categories
            title: customCategory.title || `Dynamic Section ${dynamicCategoryIndex + 1}`,
            objects: customCategory.objects || [],  // Add objects (events)
          });
        }
        dynamicCategoryIndex++;
      }

      // If there is no dynamic section to insert, push the static section
      else if (section.staticKey && staticSections.length) {
        const staticSection = staticSections.find((sec) => sec.key === section.staticKey);
        if (staticSection) {
          interleavedSections.push(staticSection);
        }
      }
    });

    // Ensure the total number of sections does not exceed 30
    const sectionsToAdd = 30 - interleavedSections.length;
    for (let i = 0; i < sectionsToAdd; i++) {
      // Only add custom categories if available
      if (dynamicCategoryIndex < customCategories.customCategories.length) {
        const customCategory = customCategories.customCategories[dynamicCategoryIndex];
        interleavedSections.push({
          key: "customCategory",
          title: customCategory?.title || `Dynamic Section ${dynamicCategoryIndex + 1}`,
          objects: customCategory?.objects || [],  // Add objects (events)
        });
        dynamicCategoryIndex++;
      }
    }

    // Return the final structured response
    return {
      status: true,
      data: interleavedSections,
    };
  } catch (error) {
    // Optionally log error
    return {
      status: false,
      data: error,
    };
  }
};



module.exports = {
  getHomeService,
};
