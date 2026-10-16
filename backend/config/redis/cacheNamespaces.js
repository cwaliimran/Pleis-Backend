/**
 * Canonical Redis namespace prefixes + write-side invalidation helpers.
 *
 * Rule: every discovery surface (home / search / maps) must be busted when
 * underlying content changes. Prefer these helpers over ad-hoc invalidate()
 * with stale/legacy prefixes (e.g. "home:pinned-content").
 */
const { invalidate, flushAllCaches } = require("./redisCache");

const NS = Object.freeze({
  HOME_GEO: "home:geo:v1",
  HOME_GLOBAL: "home:global:v1",
  HOME_USER: "home:user:v1",
  SEARCH_GEO: "search:geo:v1",
  SEARCH_GLOBAL: "search:global:v1",
  SEARCH_USER: "search:user:v1",
  MAPS_PLACES: "maps:places:lean:v4",
  MAPS_EVENTS: "maps:events:lean:v4",
  VENUE_TYPES_BY_CAT: "venueTypes:by-main-category",
  BANNERS: "banners",
  CATEGORIES_PUBLIC: "categories:public",
  FEED_CONFIG: "feed-config",
  PINNED_CONTENT: "pinnedContent",
  /** Legacy alias — no longer written; kept so old keys get cleaned on bust */
  HOME_PINNED_LEGACY: "home:pinned-content",
});

async function invalidateHomeCaches() {
  await Promise.all([
    invalidate(NS.HOME_GEO),
    invalidate(NS.HOME_GLOBAL),
    invalidate(NS.HOME_USER),
    invalidate(NS.HOME_PINNED_LEGACY),
  ]);
}

async function invalidateSearchCaches() {
  await Promise.all([
    invalidate(NS.SEARCH_GEO),
    invalidate(NS.SEARCH_GLOBAL),
    invalidate(NS.SEARCH_USER),
  ]);
}

async function invalidateMapsCaches() {
  await Promise.all([
    invalidate(NS.MAPS_PLACES),
    invalidate(NS.MAPS_EVENTS),
  ]);
}

/** Home + search + maps — use on content mutations that feed discovery. */
async function invalidateDiscoveryCaches() {
  await Promise.all([
    invalidateHomeCaches(),
    invalidateSearchCaches(),
    invalidateMapsCaches(),
  ]);
}

async function invalidatePinnedCaches() {
  await Promise.all([
    invalidate(NS.PINNED_CONTENT),
    invalidateHomeCaches(),
  ]);
}

async function invalidateBannerCaches() {
  await Promise.all([
    invalidate(NS.BANNERS),
    invalidateHomeCaches(),
  ]);
}

async function invalidateCategoryCaches() {
  await Promise.all([
    invalidate(NS.CATEGORIES_PUBLIC),
    invalidateDiscoveryCaches(),
    invalidate(NS.VENUE_TYPES_BY_CAT),
  ]);
}

async function invalidateFeedConfigCaches() {
  await Promise.all([
    invalidate(NS.FEED_CONFIG),
    invalidateHomeCaches(),
  ]);
}

async function invalidateVenueTypeCaches(activeKey) {
  const tasks = [
    invalidate(NS.VENUE_TYPES_BY_CAT),
    invalidateDiscoveryCaches(),
  ];
  if (activeKey) tasks.push(invalidate(activeKey));
  await Promise.all(tasks);
}

module.exports = {
  NS,
  invalidateHomeCaches,
  invalidateSearchCaches,
  invalidateMapsCaches,
  invalidateDiscoveryCaches,
  invalidatePinnedCaches,
  invalidateBannerCaches,
  invalidateCategoryCaches,
  invalidateFeedConfigCaches,
  invalidateVenueTypeCaches,
  flushAllCaches,
};
