const crypto = require("crypto");

function normalizeKeyword(raw = "") {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .trim()
    .replace(/\s{2,}/g, " ");
}


function buildFilterHash(filters = {}) {
  const normalized = {
    categories: (filters.categories || []).map(String).sort(),
    venueTypes: (filters.venueTypes || []).map(String).sort(),
    tags: (filters.tags || []).map(String).sort(),
    genre: (filters.genre || []).map(String).sort(),
  };

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");
}

module.exports = { normalizeKeyword, buildFilterHash };
