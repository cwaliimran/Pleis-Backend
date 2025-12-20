/**
 * Shared normalization helpers
 */

const clamp01 = (value) => {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
};

const logNormalize = (value = 0, max = 1) => {
  if (value <= 0 || max <= 0) return 0;
  return clamp01(Math.log(value + 1) / Math.log(max + 1));
};

module.exports = {
  clamp01,
  logNormalize
};
