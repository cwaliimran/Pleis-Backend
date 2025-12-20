/**
 * Home Explore sections generator
 * Absolute path – safe overwrite
 */

const fs = require("fs");
const path = require("path");

const BASE_DIR =
  "/Users/s/Desktop/Development/Projects/Pleis/Pleis-Backend/backend/app/home/sections";

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const write = (file, content) => {
  fs.writeFileSync(file, content.trimStart(), "utf8");
  console.log("✅ Created:", file);
};

ensureDir(BASE_DIR);

/* ============================
   forYouOrganizers.js
   0.7 relevance + 0.3 popularity
============================ */
write(
  path.join(BASE_DIR, "forYouOrganizers.js"),
  `
const { relevanceScore } = require("../scoring/relevance");
const { popularityScore } = require("../scoring/popularity");

module.exports = function forYouOrganizers(items, userPrefs) {
  return items
    .map(item => ({
      ...item,
      score:
        0.7 * relevanceScore({
          itemTags: item.tags || [],
          itemCategories: item.categories || [],
          userPreferences: userPrefs || []
        }) +
        0.3 * popularityScore(item.stats || {})
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
};
`
);

/* ============================
   nearYouOrganizers.js
   0.7 distance + 0.3 popularity
============================ */
write(
  path.join(BASE_DIR, "nearYouOrganizers.js"),
  `
const { distanceScore } = require("../scoring/distance");
const { popularityScore } = require("../scoring/popularity");

module.exports = function nearYouOrganizers(items) {
  return items
    .map(item => ({
      ...item,
      score:
        0.7 * distanceScore(item.distanceKm ?? 999) +
        0.3 * popularityScore(item.stats || {})
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
};
`
);

/* ============================
   trendingOrganizers.js
   0.7 views(48h) + 0.3 views(7d)
============================ */
write(
  path.join(BASE_DIR, "trendingOrganizers.js"),
  `
const { logNormalize } = require("../scoring/normalize");

module.exports = function trendingOrganizers(items) {
  return items
    .map(item => {
      const views48h = logNormalize(item.views48h || 0, 5000);
      const views7d = logNormalize(item.views7d || 0, 20000);

      return {
        ...item,
        score: 0.7 * views48h + 0.3 * views7d
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
};
`
);

/* ============================
   reservationOrganizers.js
   0.4 relevance + 0.3 popularity + 0.3 reviews
============================ */
write(
  path.join(BASE_DIR, "reservationOrganizers.js"),
  `
const { relevanceScore } = require("../scoring/relevance");
const { popularityScore } = require("../scoring/popularity");
const { clamp01 } = require("../scoring/normalize");

module.exports = function reservationOrganizers(items, userPrefs) {
  return items
    .filter(i => i.reservationsEnabled)
    .map(item => {
      const reviewScore = clamp01((item.avgRating - 1) / 4);

      return {
        ...item,
        score:
          0.4 * relevanceScore({
            itemTags: item.tags || [],
            itemCategories: item.categories || [],
            userPreferences: userPrefs || []
          }) +
          0.3 * popularityScore(item.stats || {}) +
          0.3 * reviewScore
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
};
`
);

/* ============================
   newOrganizers.js
   0.8 recency + 0.2 popularity
============================ */
write(
  path.join(BASE_DIR, "newOrganizers.js"),
  `
const { popularityScore } = require("../scoring/popularity");

module.exports = function newOrganizers(items) {
  const now = Date.now();

  return items
    .map(item => {
      const ageDays =
        (now - new Date(item.createdAt).getTime()) / 86400000;

      const recency = Math.max(0, 1 - ageDays / 30);

      return {
        ...item,
        score: 0.8 * recency + 0.2 * popularityScore(item.stats || {})
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
};
`
);

/* ============================
   popularEvents.js
   0.5 views + 0.3 likes + 0.2 reviews
============================ */
write(
  path.join(BASE_DIR, "popularEvents.js"),
  `
const { logNormalize, clamp01 } = require("../scoring/normalize");

module.exports = function popularEvents(events) {
  return events
    .map(evt => {
      const views = logNormalize(evt.views || 0, 50000);
      const likes = logNormalize(evt.likes || 0, 10000);
      const reviews = clamp01((evt.avgRating - 1) / 4);

      return {
        ...evt,
        score: 0.5 * views + 0.3 * likes + 0.2 * reviews
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
};
`
);

/* ============================
   loyaltyClubs.js
   0.5 relevance + 0.3 members + 0.2 popularity
============================ */
write(
  path.join(BASE_DIR, "loyaltyClubs.js"),
  `
const { relevanceScore } = require("../scoring/relevance");
const { popularityScore } = require("../scoring/popularity");
const { logNormalize } = require("../scoring/normalize");

module.exports = function loyaltyClubs(items, userPrefs) {
  return items
    .filter(i => !i.isMember)
    .map(item => ({
      ...item,
      score:
        0.5 * relevanceScore({
          itemTags: item.tags || [],
          itemCategories: item.categories || [],
          userPreferences: userPrefs || []
        }) +
        0.3 * logNormalize(item.membersCount || 0, 100000) +
        0.2 * popularityScore(item.stats || {})
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
};
`
);

console.log("\n🎉 Home section files created successfully");
