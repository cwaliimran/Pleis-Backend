/**
 * Build titleKey + titleValues for challenge push titles from structured fields.
 * Keys are stable snake_case; dynamic numbers/names go only in values ({placeholders}).
 * Falls back to raw challenge.title when no mapping exists.
 */
const getChallengeNotificationTitle = (challenge) => {
  // Coerce null/undefined — default params do not cover explicit null
  const safeChallenge = challenge || {};
  const taskType = safeChallenge.taskType;
  const taskValue = safeChallenge.taskValue ?? "";
  const reward = safeChallenge.reward || {};
  const rewardType = reward.rewardType;
  const rewardValue = reward.rewardValue ?? "";
  const rewardTitle =
    reward.customReward?.title ||
    reward.linkedReward?.title ||
    "";

  if (taskType === "earnPoints" && rewardType === "points") {
    return {
      titleKey: "challenge_title_earn_points_win_points",
      titleValues: { taskValue, rewardValue },
    };
  }

  if (taskType === "earnPoints" && rewardType === "specialTicket") {
    return {
      titleKey: "challenge_title_earn_points_win_ticket",
      titleValues: { taskValue },
    };
  }

  if (taskType === "referUsers" && rewardType === "points") {
    return {
      titleKey: "challenge_title_refer_users_earn_points",
      titleValues: { taskValue, rewardValue },
    };
  }

  if (taskType === "visit" && rewardType === "specialTicket") {
    return {
      titleKey: "challenge_title_visit_earn_ticket",
      titleValues: { taskValue },
    };
  }

  if (
    taskType === "visit" &&
    (rewardTitle ||
      rewardType === "menuItem" ||
      rewardType === "customReward")
  ) {
    return {
      titleKey: "challenge_title_visit_win_reward",
      titleValues: {
        taskValue,
        rewardTitle: rewardTitle || "reward",
      },
    };
  }

  if (taskType === "buyMenuItem" && rewardType === "specialTicket") {
    return {
      titleKey: "challenge_title_buy_menu_win_ticket",
      titleValues: { taskValue },
    };
  }

  if (taskType === "buyMenuItem" && rewardType === "points") {
    return {
      titleKey: "challenge_title_buy_menu_earn_points",
      titleValues: { taskValue, rewardValue },
    };
  }

  if (
    taskType === "buyMenuItem" &&
    (rewardTitle ||
      rewardType === "menuItem" ||
      rewardType === "customReward")
  ) {
    return {
      titleKey: "challenge_title_buy_menu_win_reward",
      titleValues: {
        taskValue,
        rewardTitle: rewardTitle || "reward",
      },
    };
  }

  return {
    title: safeChallenge.title || "",
  };
};

module.exports = {
  getChallengeNotificationTitle,
};
