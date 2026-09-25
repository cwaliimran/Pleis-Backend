const path = require("path");
const { SURFACES } = require("./resolveSurface");

const LOG_ROOT = path.resolve(__dirname, "../../../logs");

/** Top-level log buckets */
const LOG_DIRS = ["app", "crash", "access", "pm2"];

/** HTTP access logs: one folder per API surface under logs/access/ */
const ACCESS_SURFACE_DIRS = ["all", ...SURFACES];

/** Retention window for dated / rotated log files */
const LOG_MAX_DAYS = 14;

/** Continuous files that need daily rotation so age-based cleanup can remove them */
const CONTINUOUS_LOGS = [
  { dir: "app", name: "app.log", prefix: "app" },
  { dir: "app", name: "error.log", prefix: "error" },
  { dir: "pm2", name: "out.log", prefix: "out" },
  { dir: "pm2", name: "error.log", prefix: "pm2-error" },
];

function accessSurfaceDir(surface) {
  return path.join(LOG_ROOT, "access", surface || "other");
}

function accessDayFile(surface, day) {
  return path.join(accessSurfaceDir(surface), `${day}.log`);
}

module.exports = {
  LOG_ROOT,
  LOG_DIRS,
  ACCESS_SURFACE_DIRS,
  LOG_MAX_DAYS,
  CONTINUOUS_LOGS,
  accessSurfaceDir,
  accessDayFile,
};
