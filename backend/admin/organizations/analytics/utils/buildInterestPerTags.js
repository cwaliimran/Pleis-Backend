const buildInterestPerTags = (rows = []) => {
  /**
   * Structure:
   * {
   *   [tagId]: {
   *     tagTitle: "Fitness",
   *     males: number,
   *     females: number,
   *     others: number
   *   }
   * }
   */

  const map = {};

  for (const r of rows) {
    const key = String(r.tagId);

    // Initialize entry for tag if it doesn't exist
    if (!map[key]) {
      map[key] = {
        tagTitle: r.tagTitle,
        males: 0,
        females: 0,
        others: 0
      };
    }

    /* Normalize gender */
    const gender = r.gender === "Male" || r.gender === "Female" || r.gender === "Other" ? r.gender : "Other";

    // Increment the correct gender count
    if (gender === "Male") map[key].males++;
    else if (gender === "Female") map[key].females++;
    else map[key].others++;
  }

  // Return interest per tag, structured for easy use in front-end (e.g., charting, reporting)
  return {
    interestPerTag: Object.values(map)
  };
};

module.exports = { buildInterestPerTags };