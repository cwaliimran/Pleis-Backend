const formatNextStreakRule = async (streakRules = [], userStreaks = []) => {
  const currentVisit = userStreaks[0]?.visits || 0;

  if (!streakRules || !streakRules.length) {
    return {
      message: "No streak rules found",
      currentVisit: currentVisit,
      NextVisit: 0,
      TotalPoints: 0,
    };
  }

  // sort rules by visits small -> big
  const sortedRules = [...streakRules].sort((a, b) => a.visits - b.visits);

  // if user has no streak yet, return first rule
  if (!userStreaks || !userStreaks.length) {
    return {
      message: "No streak found for user",
      currentVisit: currentVisit,
      NextVisit: sortedRules[0].visits,
      TotalPoints: sortedRules[0].points || 0,
    };
  }

  // get current user visit

  // find next rule
  const nextRule = sortedRules.find((rule) => rule.visits > currentVisit);

  // if no next rule, user reached max
  if (!nextRule) {
    return {
      message: "You reached max visit",
      currentVisit: currentVisit,
      NextVisit: currentVisit,
      TotalPoints: 0,
    };
  }

  // sum points from all rules up to next visit
  const totalPoints = sortedRules
    .filter((rule) => rule.visits <= nextRule.visits)
    .reduce((sum, rule) => sum + (rule.points || 0), 0);

  return {
    message: "Next streak rule found",
    currentVisit: currentVisit,
    NextVisit: nextRule.visits,
    TotalPoints: totalPoints,
  };
};

module.exports = {
  formatNextStreakRule,
};