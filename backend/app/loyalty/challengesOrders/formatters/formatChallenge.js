const { getFullImageUrl } = require("@utils/imageHelper");

function formatChallengesByTierKey(challenges = [], tierKey) {
    return challenges.map(item => formatSingleChallengeByTierKey({ ...item }, tierKey));
}

function formatSingleChallengeByTierKey(item, tierKey) {
    if (!tierKey || !item?.tierLimit) return item;

    const { essential, preferred, premier, ...restTier } = item.tierLimit;
    const current = item.tierLimit[tierKey];

    item.tierLimit = {
        ...restTier,
        entryPoints: current?.entryPoints ?? null,
        retainPoints: current?.retainPoints ?? null,
    };

    delete item.tierLimit.createdAt;
    delete item.tierLimit.updatedAt;
    delete item.tierLimit.status;
    delete item.tierLimit.__v;

    return item;
}

function formatChallenge(item) {
  if (!item) return null;

  const obj = typeof item.toObject === "function" ? item.toObject() : item;

  // Format image if exists
  if (obj.challengeSnapshot?.image) {
    obj.challengeSnapshot.image = getFullImageUrl(
      obj.challengeSnapshot.image || "noimage.png"
    );
  }

  // Add percentage progress (optional enhancement)
  if (obj.progress?.current != null && obj.progress?.target > 0) {
    obj.progress.percentage = Math.min(
      100,
      Math.round((obj.progress.current / obj.progress.target) * 100)
    );
  }

  return obj; // ✅ FIX: Return the formatted object
}



module.exports = { formatChallengesByTierKey, formatChallenge };
