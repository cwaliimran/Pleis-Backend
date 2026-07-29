/**
 * Discount conflict rules:
 * - Discounts never stack on the same item.
 * - Conflict only when two discounts target the same item in overlapping windows.
 * - At any point in time, resolution order:
 *   1. Time — only discounts active at `at` are considered.
 *   2. Best price for customer — lowest final price wins.
 *   3. Latest created — tie-breaker when savings are equal.
 */

const calculateDiscountSavings = (basePrice = 0, discount) => {
  if (!discount) return 0;

  const price = Number(basePrice) || 0;
  const value = Number(discount.value) || 0;

  if (discount.type === "percentage") {
    return (price * value) / 100;
  }

  if (discount.type === "fixed") {
    return Math.min(value, price);
  }

  return 0;
};

const calculateDiscountFinalPrice = (basePrice = 0, discount) => {
  const price = Number(basePrice) || 0;
  const savings = calculateDiscountSavings(price, discount);
  return Math.max(price - savings, 0);
};

const discountsOverlap = (startA, endA, startB, endB) => {
  const aStart = new Date(startA).getTime();
  const aEnd = new Date(endA).getTime();
  const bStart = new Date(startB).getTime();
  const bEnd = new Date(endB).getTime();

  return aStart < bEnd && aEnd > bStart;
};

const isDiscountActiveAt = (discount, at = new Date()) => {
  if (!discount || discount.status !== "active") return false;

  const moment = new Date(at).getTime();
  const start = new Date(discount.startDate).getTime();
  const end = new Date(discount.endDate).getTime();

  return moment >= start && moment <= end;
};

const resolveEffectiveDiscount = (
  discounts = [],
  basePrice = 0,
  at = new Date(),
) => {
  const activeDiscounts = discounts.filter((discount) =>
    isDiscountActiveAt(discount, at),
  );

  if (!activeDiscounts.length) return null;

  return activeDiscounts.reduce((winner, candidate) => {
    if (!winner) return candidate;

    const winnerFinal = calculateDiscountFinalPrice(basePrice, winner);
    const candidateFinal = calculateDiscountFinalPrice(basePrice, candidate);

    if (candidateFinal < winnerFinal) return candidate;
    if (candidateFinal > winnerFinal) return winner;

    const winnerCreated = new Date(winner.createdAt || 0).getTime();
    const candidateCreated = new Date(candidate.createdAt || 0).getTime();

    return candidateCreated > winnerCreated ? candidate : winner;
  }, null);
};

const findOverlappingDiscounts = ({
  discounts = [],
  menuItemIds = [],
  startDate,
  endDate,
  excludeDiscountId = null,
}) => {
  const targetItemIds = new Set(menuItemIds.map((id) => id.toString()));
  const excludeId = excludeDiscountId?.toString?.() || excludeDiscountId;

  return discounts.filter((discount) => {
    if (excludeId && discount._id?.toString() === excludeId) return false;
    if (discount.status !== "active") return false;
    if (!discountsOverlap(startDate, endDate, discount.startDate, discount.endDate)) {
      return false;
    }

    return (discount.menuItems || []).some((menuItemId) =>
      targetItemIds.has(menuItemId.toString()),
    );
  });
};

const buildOverlapWarning = (overlappingDiscounts = []) => {
  if (!overlappingDiscounts.length) {
    return null;
  }

  const names = overlappingDiscounts.map((discount) => discount.name).join(", ");

  return {
    hasOverlap: true,
    message: `These items already have an active discount in this period (${names}). Only one applies at a time — the better price wins.`,
    overlappingDiscounts: overlappingDiscounts.map((discount) => ({
      _id: discount._id,
      name: discount.name,
      type: discount.type,
      value: discount.value,
      startDate: discount.startDate,
      endDate: discount.endDate,
    })),
  };
};

module.exports = {
  calculateDiscountSavings,
  calculateDiscountFinalPrice,
  discountsOverlap,
  isDiscountActiveAt,
  resolveEffectiveDiscount,
  findOverlappingDiscounts,
  buildOverlapWarning,
};
