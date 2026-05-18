const buildInterestPerCategory = (rows = []) => {
  /**
   * Structure:
   * {
   *   [categoryId]: {
   *     category: "Fitness",
   *     users: Set(userId),
   *     males: number,
   *     females: number,
   *     others: number
   *   }
   * }
   */

  const map = {};

  for (const r of rows) {
    const key = String(r.categoryId);

    if (!map[key]) {
      map[key] = {
        category: r.categoryTitle,
        males: 0,
        females: 0,
        others: 0
      };
    }

    /* Normalize gender */
    const gender =
      r.gender === "Male" || r.gender === "Female" || r.gender === "Other"
        ? r.gender
        : "Other";

    if (gender === "Male") map[key].males++;
    else if (gender === "Female") map[key].females++;
    else map[key].others++;
  }

  return {
    interestPerCategory: Object.values(map)
  };
};

module.exports = { buildInterestPerCategory };
