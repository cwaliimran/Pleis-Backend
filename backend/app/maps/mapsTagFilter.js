const mongoose = require("mongoose");

/**
 * advanceFilters.genre as the guest app sends it: the ids of the tags the
 * guest selected in the filter (Advanced filter → genres: selectedVibes →
 * buildPayload genre), not tag-type ids. Same payload as global search.
 *
 * Several selected tags narrow the result: a place or event must carry every
 * one of them, so callers match these with $all.
 */
function genreTagObjectIds(genre) {
  const ids = (Array.isArray(genre) ? genre : [])
    .map(String)
    .filter((id) => mongoose.Types.ObjectId.isValid(id));
  return [...new Set(ids)].map((id) => new mongoose.Types.ObjectId(id));
}

/**
 * Every tag the filter selected: advanceFilters.genre (what the guest app
 * sends) plus advanceFilters.tags (older clients). Match with $all.
 */
function selectedTagObjectIds(advanceFilters = {}) {
  const af = advanceFilters || {};
  const list = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  return genreTagObjectIds([...list(af.tags), ...list(af.genre)]);
}

module.exports = { genreTagObjectIds, selectedTagObjectIds };
