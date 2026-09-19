/**
 * Build titleKey + titleValues for challenge push titles from structured fields.
 * Keys are stable snake_case; dynamic numbers/names go only in values ({placeholders}).
 * Falls back to raw challenge.title when no mapping exists.
 */

const normalizeTaskType = (taskType) => {
  if (!taskType || typeof taskType !== "string") return taskType;
  // globalVisit → visit, globalEarnPoints → earnPoints, globalReferUsers → referUsers
  if (taskType.startsWith("global") && taskType.length > 6) {
    const rest = taskType.slice(6);
    return rest.charAt(0).toLowerCase() + rest.slice(1);
  }
  return taskType;
};

const isTicketReward = (rewardType) =>
  rewardType === "specialTicket" ||
  rewardType === "ticketReward" ||
  rewardType === "globalTicketReward";

const resolveRewardTitle = (reward = {}) => {
  if (reward.customReward?.title) return reward.customReward.title;
  if (reward.linkedReward?.title) return reward.linkedReward.title;
  const menuItem = Array.isArray(reward.rewardMenuItem)
    ? reward.rewardMenuItem[0]
    : reward.rewardMenuItem;
  if (menuItem && typeof menuItem === "object") {
    return menuItem.title || menuItem.name || "";
  }
  return "";
};

const getChallengeNotificationTitle = (challenge) => {
  // Coerce null/undefined — default params do not cover explicit null
  const safeChallenge = challenge || {};
  const taskType = normalizeTaskType(safeChallenge.taskType);
  const taskValue = safeChallenge.taskValue ?? "";
  const reward = safeChallenge.reward || {};
  const rewardType = reward.rewardType;
  const rewardValue = reward.rewardValue ?? "";
  const rewardTitle = resolveRewardTitle(reward);

  if (taskType === "earnPoints" && rewardType === "points") {
    return {
      titleKey: "challenge_title_earn_points_win_points",
      titleValues: { taskValue, rewardValue },
    };
  }

  if (taskType === "earnPoints" && isTicketReward(rewardType)) {
    return {
      titleKey: "challenge_title_earn_points_win_ticket",
      titleValues: { taskValue },
    };
  }

  if (
    taskType === "earnPoints" &&
    (rewardTitle || rewardType === "customReward" || rewardType === "menuItem")
  ) {
    return {
      titleKey: "challenge_title_earn_points_win_reward",
      titleValues: {
        taskValue,
        rewardTitle: rewardTitle || "reward",
      },
    };
  }

  if (taskType === "referUsers" && rewardType === "points") {
    return {
      titleKey: "challenge_title_refer_users_earn_points",
      titleValues: { taskValue, rewardValue },
    };
  }

  if (taskType === "visit" && isTicketReward(rewardType)) {
    return {
      titleKey: "challenge_title_visit_earn_ticket",
      titleValues: { taskValue },
    };
  }

  if (taskType === "visit" && rewardType === "points") {
    return {
      titleKey: "challenge_title_visit_earn_points",
      titleValues: { taskValue, rewardValue },
    };
  }

  if (
    taskType === "visit" &&
    (rewardTitle ||
      rewardType === "menuItem" ||
      rewardType === "customReward" ||
      rewardType === "linkedReward")
  ) {
    if (!rewardTitle && rewardType === "menuItem") {
      return {
        titleKey: "challenge_title_visit_win_menu_item",
        titleValues: { taskValue },
      };
    }
    return {
      titleKey: "challenge_title_visit_win_reward",
      titleValues: {
        taskValue,
        rewardTitle: rewardTitle || "reward",
      },
    };
  }

  if (
    taskType === "buyMenuItem" &&
    (isTicketReward(rewardType) || rewardType === "linkedReward")
  ) {
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
