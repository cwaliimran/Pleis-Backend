const { REWARD_CLAIM_REASONS } = require("./rewardClaimReasons");

const normalizeRewardClaimMeta = ({
  reward,
  claimedCount = 0,
  userPoints = null,
  userTierEntry = null,
  now = new Date(),
}) => {
  const cannotClaimReasons = [];

  const claimLimit = reward.claimLimit ?? 0;
  const pointsRequired = reward.minPointsRequiredToClaim ?? 0;
  const tierRequired = reward?.tierLimit?.entryPoints ?? 0;

  /* -------------------------------
     Claim limit
  ------------------------------- */
  if (claimLimit > 0 && claimedCount >= claimLimit) {
    cannotClaimReasons.push(
      REWARD_CLAIM_REASONS.CLAIM_LIMIT_REACHED
    );
  }

  /* -------------------------------
     Points eligibility
  ------------------------------- */
  if (
    userPoints !== null &&
    userPoints < pointsRequired
  ) {
    cannotClaimReasons.push(
      REWARD_CLAIM_REASONS.INSUFFICIENT_POINTS
    );
  }

  /* -------------------------------
     Tier eligibility
  ------------------------------- */
  if (
    userTierEntry !== null &&
    userTierEntry < tierRequired
  ) {
    cannotClaimReasons.push(
      REWARD_CLAIM_REASONS.TIER_NOT_ELIGIBLE
    );
  }

  /* -------------------------------
     Reward state
  ------------------------------- */
  if (reward.status && reward.status !== "active") {
    cannotClaimReasons.push(
      REWARD_CLAIM_REASONS.REWARD_INACTIVE
    );
  }

  if (reward.endDate && new Date(reward.endDate) < now) {
    cannotClaimReasons.push(
      REWARD_CLAIM_REASONS.REWARD_EXPIRED
    );
  }

  /* -------------------------------
     Derived flags
  ------------------------------- */
  const hasLimit = claimLimit > 0;
  const claimRemaining = hasLimit
    ? Math.max(claimLimit - claimedCount, 0)
    : null;

  const isClaimed = claimedCount > 0;
  const canClaim = cannotClaimReasons.length === 0;

  return {
    canClaim,
    isClaimed,
    claimRemaining,
    cannotClaimReasons, // ✅ precise naming
  };
};

module.exports = { normalizeRewardClaimMeta };
