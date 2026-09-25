const fs = require("fs");
const path = require("path");
const {
  LOG_ROOT,
  LOG_DIRS,
  ACCESS_SURFACE_DIRS,
  LOG_MAX_DAYS,
  CONTINUOUS_LOGS,
} = require("./logPaths");

function ensureLogDirs() {
  if (!fs.existsSync(LOG_ROOT)) fs.mkdirSync(LOG_ROOT, { recursive: true });
  for (const dir of LOG_DIRS) {
    const full = path.join(LOG_ROOT, dir);
    if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
  }
  // Per-role HTTP access folders: logs/access/{admin,app,organizer,staff,…}
  for (const surface of ACCESS_SURFACE_DIRS) {
    const full = path.join(LOG_ROOT, "access", surface);
    if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
  }
}

/**
 * Recursively delete dated files older than maxDays under a directory.
 */
function cleanupOldLogsInDir(dir, maxDays = LOG_MAX_DAYS, relative = dir) {
  const full = path.join(LOG_ROOT, dir);
  if (!fs.existsSync(full)) return { deleted: [] };

  const now = Date.now();
  const deleted = [];

  for (const name of fs.readdirSync(full)) {
    const filePath = path.join(full, name);
    const rel = path.join(relative, name);
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      const nested = cleanupOldLogsInDir(path.join(dir, name), maxDays, rel);
      deleted.push(...nested.deleted);
      continue;
    }

    if (!stat.isFile()) continue;

    // Never age-delete live continuous files — they are rotated separately
    const isLiveContinuous = CONTINUOUS_LOGS.some(
      (c) => path.join(LOG_ROOT, c.dir, c.name) === filePath
    );
    if (isLiveContinuous) continue;

    const ageDays = (now - stat.mtimeMs) / (1000 * 60 * 60 * 24);
    if (ageDays > maxDays) {
      try {
        fs.unlinkSync(filePath);
        deleted.push(rel);
      } catch (err) {
        console.error(`[log-cleanup] failed to delete ${filePath}:`, err.message);
      }
    }
  }

  return { deleted };
}

/**
 * Rename live continuous logs to dated files so retention can remove them.
 * Uses yesterday's date (intended for a daily early-morning cron).
 */
function rotateContinuousLogs() {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const rotated = [];

  for (const { dir, name, prefix } of CONTINUOUS_LOGS) {
    const filePath = path.join(LOG_ROOT, dir, name);
    if (!fs.existsSync(filePath)) continue;

    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      continue;
    }
    if (!stat.isFile() || stat.size === 0) continue;

    const dest = path.join(LOG_ROOT, dir, `${prefix}-${yesterday}.log`);
    try {
      if (!fs.existsSync(dest)) {
        fs.renameSync(filePath, dest);
      } else {
        fs.appendFileSync(dest, fs.readFileSync(filePath));
        fs.writeFileSync(filePath, "");
      }
      rotated.push(path.join(dir, `${prefix}-${yesterday}.log`));
    } catch (err) {
      console.error(`[log-cleanup] rotate failed for ${filePath}:`, err.message);
    }
  }

  return { rotated };
}

/**
 * Full cleanup pass: rotate continuous files, then delete anything older than maxDays.
 */
function runLogCleanup({ maxDays = LOG_MAX_DAYS, rotate = true } = {}) {
  ensureLogDirs();

  const rotated = rotate ? rotateContinuousLogs().rotated : [];
  const deleted = [];

  for (const dir of LOG_DIRS) {
    const result = cleanupOldLogsInDir(dir, maxDays);
    deleted.push(...result.deleted);
  }

  return {
    maxDays,
    rotated,
    deleted,
    rotatedCount: rotated.length,
    deletedCount: deleted.length,
  };
}

module.exports = {
  ensureLogDirs,
  cleanupOldLogsInDir,
  rotateContinuousLogs,
  runLogCleanup,
};
