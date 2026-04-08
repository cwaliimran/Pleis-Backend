const buildInterestPerTags = (rows = []) => {
  const map = {};

  for (const r of rows) {
    const key = String(r.tagId);

    if (!map[key]) {
      map[key] = {
        tagTitle: r.tagTitle,
        males: 0,
        females: 0,
        others: 0,
      };
    }

    // ✅ Use actual values from input instead of incrementing
    map[key].males += r.males || 0;
    map[key].females += r.females || 0;
    map[key].others += r.others || 0;
  }

  return {
    interestPerTag: Object.values(map)
  };
};

module.exports = { buildInterestPerTags };