const REWARD_CLAIM_REASONS = require("./rewardClaimReasons");
const { isRewardEndDateExpired } = require("../../../../commonModules/loyalty/rewards/utils/rewardEndDate");

const REWARD_REASON_ORDER = Object.freeze({
  [REWARD_CLAIM_REASONS.TIER_NOT_ELIGIBLE]: 1,
  [REWARD_CLAIM_REASONS.CLAIM_LIMIT_REACHED]: 2,
  [REWARD_CLAIM_REASONS.INSUFFICIENT_POINTS]: 3,
  [REWARD_CLAIM_REASONS.REWARD_INACTIVE]: 4,
  [REWARD_CLAIM_REASONS.REWARD_EXPIRED]: 5,
});

const normalizeRewardClaimMeta = ({
  reward,
  claimedCount = 0,
  userPoints = null,
  userTierEntry = null,
  now = new Date(),
  timezone = "UTC",
}) => {
  const cannotClaimReasons = [];
  const rewardId = reward?._id?.toString();

  const claimLimit = reward?.claimLimit ?? 0;
  const pointsRequired = reward?.minPointsRequiredToClaim ?? 0;
  const tierRequired = reward?.tierLimit?.entryPoints ?? 0;

  if (userTierEntry !== null && userTierEntry < tierRequired) {
    cannotClaimReasons.push(REWARD_CLAIM_REASONS.TIER_NOT_ELIGIBLE);
  }

  if (claimLimit > 0 && claimedCount >= claimLimit) {
    cannotClaimReasons.push(REWARD_CLAIM_REASONS.CLAIM_LIMIT_REACHED);
  }

  if (userPoints !== null && userPoints < pointsRequired) {
    cannotClaimReasons.push(REWARD_CLAIM_REASONS.INSUFFICIENT_POINTS);
  }

  if (reward?.status && reward.status !== "active") {
    cannotClaimReasons.push(REWARD_CLAIM_REASONS.REWARD_INACTIVE);
  }

  if (isRewardEndDateExpired(reward?.endDate, now, timezone)) {
    cannotClaimReasons.push(REWARD_CLAIM_REASONS.REWARD_EXPIRED);
  }

  cannotClaimReasons.sort(
    (a, b) =>
      (REWARD_REASON_ORDER[a] ?? 999) -
      (REWARD_REASON_ORDER[b] ?? 999)
  );

  return {
    canClaim: cannotClaimReasons.length === 0,
    isClaimed: claimedCount > 0,
    claimRemaining:
      claimLimit > 0
        ? Math.max(claimLimit - claimedCount, 0)
        : null,
    cannotClaimReasons,
  };
};

module.exports = { normalizeRewardClaimMeta };
