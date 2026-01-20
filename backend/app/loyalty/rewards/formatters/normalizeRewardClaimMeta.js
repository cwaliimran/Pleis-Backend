const normalizeRewardClaimMeta = ({
  reward,
  claimedCount = 0,
  userPoints = null,
}) => {
  const claimLimit = reward.claimLimit ?? 0;
  const pointsRequired = reward.minPointsRequiredToClaim ?? 0;

  const hasLimit = claimLimit > 0;
  const claimRemaining = hasLimit
    ? Math.max(claimLimit - claimedCount, 0)
    : null;

  const isClaimed = claimedCount > 0;
  const canClaim =
    (claimRemaining === null || claimRemaining > 0) &&
    (userPoints === null || userPoints >= pointsRequired);

  return {
    canClaim,
    isClaimed,
    claimRemaining,
  };
};

module.exports = { normalizeRewardClaimMeta };
