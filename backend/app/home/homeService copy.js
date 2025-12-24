const { getBannerControls } = require("../../admin/bannerControl/bannerControlsService");
const { getPublicHighlights } = require("../highlights/highlightService");
const { getUserRecentlyViewedItems } = require("../recentlyViewed/recentlyViewedItemService");
const { sendResponse } = require("../../helperUtils/responseUtil");
const { getCustomCategories, transformCustomCategoryObjects } = require("../customCategories/customCategoriesService");
const { getNearbyEvents, getForYouEvents, getEventsGroupedByTagsService } = require("../events/eventService");
const { getChallenges } = require("../loyalty/challenges/challengesService");
const { getPromotions } = require("../loyalty/promotions/promotionsService");
const { getPublicCategories } = require("../publicCategories/categoriesService");
const { getPopularEvents } = require("../popularEvents/popularEventsService");
const {
  getSuggestedLoyaltyClubs,
  getNearbyOrganizationsService,
  organizationsByVenueTypeService,
} = require("../organizationProfile/organizationProfileService");
const {
  getRemainingEventsAndUsersRepo,
  getRemainingEventsGroupedByVenueTypesRepo,
  getRemainingOrganizersRepo,
} = require("./homeRepository");

const getHomeService = async ({ queryData }) => {
  const { userId, userLocation, radiusKm, timezone, category, time } = queryData;

  try {
    // ----------------------------------------------------
    // 1️⃣ FETCH EVERYTHING IN PARALLEL
    // ----------------------------------------------------
    const [
      categoriesRes,
      top10,
      bannersRes,
      forYou,
      nearYouEvents,
      nearYouOrganizations,
      venueTypesRaw,
      tagGroupsRaw,
      customCategoriesRes,
      highlightsRes,
      recentlyViewed,
      challenges,
      promotions,
      suggestedLoyaltyClubs,
      // remainingEventsByVenueTypes,
    ] = await Promise.all([
      getPublicCategories({}),
      getPopularEvents({ userLocation, userId, timezone, category, time }),
      getBannerControls({ page: 1, limit: 10, status: "active", category }),
      getForYouEvents(userId, userLocation, timezone, category, time),
      getNearbyEvents(queryData),
      getNearbyOrganizationsService({
        location: userLocation.coordinates,
        radiusKm,
        timezone,
        page: 1,
        limit: 10,
        userId,
      }),
      organizationsByVenueTypeService({
        location: userLocation.coordinates,
        radiusKm,
        timezone,
        page: 1,
        limit: 10,
        userId,
      }),
      getEventsGroupedByTagsService({
        location: userLocation.coordinates,
        radiusKm,
        timezone,
        userId,
      }),
      getCustomCategories({
        userLocation,
        userId,
        timezone,
        page: 1,
        limit: 10,
        status: "active",
        category,
        time,
      }),
      getPublicHighlights({
        userId,
        page: 1,
        limit: 10,
        userLocation,
        category,
        time,
        timezone,
      }),
      getUserRecentlyViewedItems({
        userId,
        location: userLocation,
        timezone,
        targetType: "event",
        page: 1,
        limit: 10,
      }),
      [],//getChallenges({ page: 1, limit: 10, timezone }),
      getPromotions({ page: 1, limit: 10, timezone, category }),
      getSuggestedLoyaltyClubs({ page: 1, limit: 10, userId }),
      // getRemainingEventsGroupedByVenueTypesRepo({ userId, timezone }),
    ]);

    // ----------------------------------------------------
    // 2️⃣ NORMALIZE STATIC SOURCES
    // ----------------------------------------------------
    const categories = categoriesRes?.categories || [];
    const banners = bannersRes?.bannerControls || [];
    const highlights = highlightsRes?.highlights || [];
    const customCategories = customCategoriesRes?.customCategories || [];
    const topPicks = []; // TODO: plug in real "Top Picks" source when available

    // venueTypesRaw & tagGroupsRaw are arrays of { title, data, key }
    const venueQueue = Array.isArray(venueTypesRaw)
      ? venueTypesRaw
          .filter((v) => Array.isArray(v.data) && v.data.length)
          .map((v) => ({
            key: "organizationsByVenueType",
            title: v.title,
            data: v.data,
          }))
      : [];

    const tagQueue = Array.isArray(tagGroupsRaw)
      ? tagGroupsRaw
          .filter((t) => Array.isArray(t.data) && t.data.length)
          .map((t) => ({
            key: "eventsGroupedByTags",
            title: t.title,
            data: t.data,
          }))
      : [];

    const bannerQueue = [...banners]; // for dynamic insertion later

    const feed = [];

    const push = (section) => {
      if (!section) return;
      // Skip empty array sections
      if (Array.isArray(section.data) && section.data.length === 0) return;
      feed.push(section);
    };

    // ----------------------------------------------------
    // 3️⃣ STATIC HEADER (ORDERED)
    // ----------------------------------------------------
    // Categories
    push({
      key: "categories",
      title: "Categories",
      data: categories,
    });

    // Top 10 promos (if any)
    push({
      key: "top10",
      title: "Top 10",
      data: top10 || [],
    });

    // For You – events
    push({
      key: "forYou",
      title: "For You",
      data: forYou?.data || [],
    });

    // Near You – events (optional)
    if (Array.isArray(nearYouEvents?.events) && nearYouEvents.events.length) {
      push({
        key: "nearYouEvents",
        title: "Near You Events",
        data: nearYouEvents.events,
      });
    }

    // Near You – organizers (from closest)
    if (
      nearYouOrganizations &&
      Array.isArray(nearYouOrganizations.organizations) &&
      nearYouOrganizations.organizations.length
    ) {
      push({
        key: "nearYouOrganizations",
        title: "Near You Organizations",
        data: nearYouOrganizations, // keep shape { organizations: [...] }
      });
    }

    // Top Picks (currently empty → will be skipped by push)
    push({
      key: "topPicks",
      title: "Top Picks",
      data: topPicks,
    });

    // First banner slot
    if (bannerQueue.length) {
      push({
        key: "banners",
        title: "Banners",
        data: bannerQueue.shift(),
      });
    }

    // First custom category
    if (customCategories.length) {
      const firstCustom = customCategories.shift();
      if (firstCustom?.objects?.length) {
        push({
          key: "customCategory",
          title: firstCustom.title || "Custom Category",
          objects: firstCustom.objects,
        });
      }
    }

    // Highlights
    push({
      key: "highlights",
      title: "Highlights",
      data: highlights,
    });

    // Recently viewed
    push({
      key: "recentlyViewed",
      title: "Recently Viewed",
      data: recentlyViewed?.recentlyViewedItems || [],
    });

    // ----------------------------------------------------
    // 4️⃣ DYNAMIC BODY: VenueType ↔ Tag Blocks + Banners + Custom
    //    - Don't show more than 2 organizer (venue) sections in a row
    // ----------------------------------------------------
    let venueStreak = 0;
    let blockCount = 0;

    while ((venueQueue.length || tagQueue.length) && feed.length < 60) {
      blockCount++;

      // VENUE TYPE SECTION (Organizers) — max 2 in a row
      if (venueQueue.length && venueStreak < 2) {
        const venueSection = venueQueue.shift();
        if (venueSection?.data?.length) {
          push(venueSection);
          venueStreak++;
        }
      }

      // TAG SECTIONS (Events) — up to 2 after a venue block
      for (let i = 0; i < 2 && tagQueue.length; i++) {
        const tagSection = tagQueue.shift();
        if (tagSection?.data?.length) {
          push(tagSection);
          // Tag sections break organizer streak
          venueStreak = 0;
        }
      }

      // Insert a banner every 2 blocks if available
      if (blockCount % 2 === 0 && bannerQueue.length) {
        push({
          key: "banners",
          title: "Banners",
          data: bannerQueue.shift(),
        });
        venueStreak = 0;
      }

      // Fill with custom categories in between blocks if available
      if (customCategories.length) {
        const custom = customCategories.shift();
        if (custom?.objects?.length) {
          push({
            key: "customCategory",
            title: custom.title || "Custom Category",
            objects: custom.objects,
          });
          venueStreak = 0;
        }
      }
    }

    // ----------------------------------------------------
    // 5️⃣ PROMOTIONS, SUGGESTED CLUBS, CHALLENGES
    // ----------------------------------------------------
    // Promotions (single section)
    if (
      promotions &&
      Array.isArray(promotions.promotions) &&
      promotions.promotions.length
    ) {
      push({
        key: "promotions",
        title: "Promotions",
        data: promotions, // keep shape { promotions: [...], meta }
      });
    }

    // Suggested loyalty clubs (organizers-like but at the tail)
    push({
      key: "suggestedLoyaltyClubs",
      title: "Suggested Loyalty Clubs",
      data: suggestedLoyaltyClubs.formatted || [],
    });

    // Challenges
    push({
      key: "challenges",
      title: "Challenges",
      data: challenges || [],
    });

  /*   // ----------------------------------------------------
    // 6️⃣ REMAINING EVENTS BY VENUE TYPES (TAIL ONLY)
    //     mapped as customCategory sections
    // ----------------------------------------------------
    if (Array.isArray(remainingEventsByVenueTypes)) {
      remainingEventsByVenueTypes.forEach((group) => {
        const mappedEvents = Array.isArray(group.data)
          ? group.data.map((evt) =>
              transformCustomCategoryObjects(evt, "Event", userLocation, timezone)
            )
          : [];

        if (mappedEvents.length) {
          push({
            key: "customCategory",
            title: group.title || "Events",
            data: mappedEvents,
          });
        }
      });
    } */

    // ----------------------------------------------------
    // ✅ DONE
    // ----------------------------------------------------
    return { status: true, data: feed };
  } catch (error) {
    return sendResponse({
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};

module.exports = {
  getHomeService,
};
