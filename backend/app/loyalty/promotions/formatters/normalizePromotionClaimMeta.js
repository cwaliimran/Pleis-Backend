const PROMOTION_REASONS = Object.freeze({
  TIER_NOT_ELIGIBLE: "TIER_NOT_ELIGIBLE",
  CLAIM_LIMIT_REACHED: "CLAIM_LIMIT_REACHED",
  INSUFFICIENT_POINTS: "INSUFFICIENT_POINTS",
  PROMOTION_INACTIVE: "PROMOTION_INACTIVE",
  PROMOTION_NOT_STARTED: "PROMOTION_NOT_STARTED",
  PROMOTION_EXPIRED: "PROMOTION_EXPIRED",
  PROMOTION_RECURRENCE_INACTIVE: "PROMOTION_RECURRENCE_INACTIVE",
  PROMOTION_DAY_INACTIVE: "PROMOTION_DAY_INACTIVE",
  PROMOTION_TIME_INACTIVE: "PROMOTION_TIME_INACTIVE",
});

const REASON_ORDER = {
  TIER_NOT_ELIGIBLE: 1,
  CLAIM_LIMIT_REACHED: 2,
  INSUFFICIENT_POINTS: 3,
  PROMOTION_INACTIVE: 4,
  PROMOTION_NOT_STARTED: 5,
  PROMOTION_EXPIRED: 6,
  PROMOTION_RECURRENCE_INACTIVE: 7,
  PROMOTION_DAY_INACTIVE: 8,
  PROMOTION_TIME_INACTIVE: 9,
};

const normalizePromotionClaimMeta = ({
  promotion,
  claimedCount = 0,
  userPoints = 0,
  userTierEntry = 0,
  now = new Date(),
  timezone = "UTC",
}) => {
  const cannotClaimReasons = [];

  const claimLimit = promotion?.claimLimit ?? 0;
  const tierRequired =
    promotion?.tierLimit?.entryPoints ?? 0;

  /* ---------- Tier ---------- */
  if (userTierEntry < tierRequired) {
    cannotClaimReasons.push("TIER_NOT_ELIGIBLE");
  }

  /* ---------- Claim limit ---------- */
  if (claimLimit > 0 && claimedCount >= claimLimit) {
    cannotClaimReasons.push("CLAIM_LIMIT_REACHED");
  }

  /* ---------- Points ---------- */
  if (
    promotion.promotionType === "claimPromotion" &&
    promotion.claimPoints &&
    userPoints < promotion.claimPoints
  ) {
    cannotClaimReasons.push("INSUFFICIENT_POINTS");
  }

  /* ---------- Status ---------- */
  if (promotion.status !== "active") {
    cannotClaimReasons.push("PROMOTION_INACTIVE");
  }

  cannotClaimReasons.sort(
    (a, b) =>
      (REASON_ORDER[a] ?? 999) -
      (REASON_ORDER[b] ?? 999)
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


module.exports = { normalizePromotionClaimMeta };
