/**
 * Cache policy: only plain pagination (and stable enum dimensions like status)
 * may be Redis-cached. Keyword / free-text search / date / custom sort /
 * advanceFilters / ids must always hit the DB.
 */

function isBlank(v) {
  return v == null || v === "" || (typeof v === "string" && !v.trim());
}

function isNonEmptyList(v) {
  if (Array.isArray(v)) return v.filter(Boolean).length > 0;
  return !isBlank(v) && v !== "all" && v !== "none" && v !== "_";
}

/** True when advanceFilters has no user-selected facets. */
function isAdvanceFiltersEmpty(af = {}) {
  if (!af || typeof af !== "object") return true;
  if (isNonEmptyList(af.categories)) return false;
  if (isNonEmptyList(af.tags)) return false;
  if (isNonEmptyList(af.genre)) return false;
  if (isNonEmptyList(af.venueTypes)) return false;
  if (Number(af.distanceFrom) > 0) return false;
  if (Number(af.distanceTo) > 0) return false;
  if (!isBlank(af.time) && af.time !== "all") return false;
  if (!isBlank(af.customCategoryId)) return false;
  return true;
}

/**
 * Admin / catalog list endpoints.
 * Cacheable only when there is no keyword, date, custom sort, or scoped userId.
 * `status` may remain (enum) and belongs in the cache key.
 */
function isPlainListCacheable({
  keyword,
  date,
  sortBy,
  sortOrder,
  userId,
} = {}) {
  if (!isBlank(keyword)) return false;
  if (!isBlank(date)) return false;
  if (!isBlank(sortBy)) return false;
  if (!isBlank(sortOrder)) return false;
  if (!isBlank(userId)) return false;
  return true;
}

/**
 * Global keyword search: only cache empty-keyword browse with no advanceFilters.
 */
function isPlainSearchCacheable({ keyword, advanceFilters } = {}) {
  if (!isBlank(keyword) && String(keyword).trim() !== "") return false;
  return isAdvanceFiltersEmpty(advanceFilters);
}

/**
 * FilterKey / maps drill-downs: page+limit (+ geo cell) only — no facets/title/ids.
 */
function isPlainFilterKeyCacheable({
  advanceFilters,
  tagId,
  customCategoryId,
  title,
  categoriesFilter,
} = {}) {
  if (!isAdvanceFiltersEmpty(advanceFilters)) return false;
  if (isNonEmptyList(tagId)) return false;
  if (isNonEmptyList(customCategoryId)) return false;
  if (isNonEmptyList(categoriesFilter)) return false;
  const t = title == null ? "" : String(title).trim().toLowerCase();
  if (t && t !== "_") return false;
  return true;
}

/** Maps viewport: cache bounds-only; keyword or advanceFilters → miss. */
function isPlainMapCacheable({ keyword, advanceFilters } = {}) {
  if (!isBlank(keyword) && String(keyword).trim() !== "") return false;
  return isAdvanceFiltersEmpty(advanceFilters);
}

module.exports = {
  isBlank,
  isAdvanceFiltersEmpty,
  isPlainListCacheable,
  isPlainSearchCacheable,
  isPlainFilterKeyCacheable,
  isPlainMapCacheable,
};
