const fs = require("fs");
const path = require("path");
const {
  LOG_ROOT,
  LOG_DIRS,
  LOG_MAX_DAYS,
  CONTINUOUS_LOGS,
  ACCESS_SURFACE_DIRS,
  accessDayFile,
} = require("../../config/logging/logPaths");
const { SURFACES } = require("../../config/logging/resolveSurface");

const VALID_TYPES = new Set(["access", "app", "error", "crash", "pm2"]);

function fileHasContent(filePath) {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).size > 0;
  } catch {
    return false;
  }
}

/**
 * Pick the newest non-empty *.log in a directory (optionally matching prefix).
 */
function findNewestLogInDir(dirRelative, { prefix } = {}) {
  const full = path.join(LOG_ROOT, dirRelative);
  if (!fs.existsSync(full)) return null;

  const matches = fs
    .readdirSync(full)
    .filter((name) => {
      if (!name.endsWith(".log")) return false;
      if (!prefix) return true;
      return name === `${prefix}.log` || name.startsWith(`${prefix}-`);
    })
    .map((name) => {
      const filePath = path.join(full, name);
      try {
        const stat = fs.statSync(filePath);
        return {
          name,
          filePath,
          relPath: path.join(dirRelative, name).replace(/\\/g, "/"),
          size: stat.size,
          mtimeMs: stat.mtimeMs,
        };
      } catch {
        return null;
      }
    })
    .filter((f) => f && f.size > 0)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  return matches[0] || null;
}

/**
 * Resolve a user-supplied file path safely under LOG_ROOT.
 * Accepts: "access/admin/2026-09-25.log", "admin/2026-09-25.log", or legacy basenames.
 */
function resolveSafeUserFile(file, type) {
  if (!file) return null;

  const cleaned = String(file)
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\.\./g, "");

  const candidates = [];

  // Full relative under logs/
  candidates.push(path.join(LOG_ROOT, cleaned));

  // Shorthand: "admin/2026-09-25.log" → access/admin/...
  if (!cleaned.startsWith("access/") && cleaned.includes("/")) {
    candidates.push(path.join(LOG_ROOT, "access", cleaned));
  }

  // Legacy flat basename under each top-level dir
  const base = path.basename(cleaned);
  for (const dir of LOG_DIRS) {
    candidates.push(path.join(LOG_ROOT, dir, base));
  }
  // Legacy flat under access surface folders
  for (const surface of ACCESS_SURFACE_DIRS) {
    candidates.push(path.join(LOG_ROOT, "access", surface, base));
  }

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (!resolved.startsWith(path.resolve(LOG_ROOT))) continue;
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) continue;

    const rel = path.relative(LOG_ROOT, resolved).replace(/\\/g, "/");
    let resolvedType = type || "access";
    if (rel.startsWith("app/") && base.startsWith("error")) resolvedType = "error";
    else if (rel.startsWith("app/")) resolvedType = "app";
    else if (rel.startsWith("access/")) resolvedType = "access";
    else if (rel.startsWith("crash/")) resolvedType = "crash";
    else if (rel.startsWith("pm2/")) resolvedType = "pm2";

    return { filePath: resolved, type: resolvedType, relPath: rel };
  }

  return null;
}

function resolveLogFile({ type, date, file, surface }) {
  if (file) {
    return resolveSafeUserFile(file, type);
  }

  const day = date || new Date().toISOString().slice(0, 10);

  if (type === "access") {
    const folder = surface || "all";
    const preferred = accessDayFile(folder, day);
    if (fileHasContent(preferred)) {
      return {
        filePath: preferred,
        type: "access",
        relPath: path.relative(LOG_ROOT, preferred).replace(/\\/g, "/"),
      };
    }

    // Newest in that surface folder
    const newest = findNewestLogInDir(path.join("access", folder));
    if (newest) {
      return { filePath: newest.filePath, type: "access", relPath: newest.relPath };
    }

    // Fallback: combined "all"
    if (folder !== "all") {
      const allNewest = findNewestLogInDir("access/all");
      if (allNewest) {
        return { filePath: allNewest.filePath, type: "access", relPath: allNewest.relPath };
      }
    }

    // Legacy flat files from before folder migration
    const legacyFlat = path.join(LOG_ROOT, "access", `access-${day}.log`);
    if (fileHasContent(legacyFlat)) {
      return {
        filePath: legacyFlat,
        type: "access",
        relPath: path.relative(LOG_ROOT, legacyFlat).replace(/\\/g, "/"),
      };
    }
    const legacySurface = surface
      ? path.join(LOG_ROOT, "access", `${surface}-${day}.log`)
      : null;
    if (legacySurface && fileHasContent(legacySurface)) {
      return {
        filePath: legacySurface,
        type: "access",
        relPath: path.relative(LOG_ROOT, legacySurface).replace(/\\/g, "/"),
      };
    }

    return {
      filePath: preferred,
      type: "access",
      relPath: path.relative(LOG_ROOT, preferred).replace(/\\/g, "/"),
    };
  }

  if (type === "app") {
    const dated = path.join(LOG_ROOT, "app", `app-${day}.log`);
    const live = path.join(LOG_ROOT, "app", "app.log");
    if (fileHasContent(dated)) {
      return { filePath: dated, type: "app", relPath: `app/app-${day}.log` };
    }
    if (fileHasContent(live)) {
      return { filePath: live, type: "app", relPath: "app/app.log" };
    }
    const newest = findNewestLogInDir("app", { prefix: "app" });
    if (newest) return { filePath: newest.filePath, type: "app", relPath: newest.relPath };
    return { filePath: live, type: "app", relPath: "app/app.log" };
  }

  if (type === "error") {
    const dated = path.join(LOG_ROOT, "app", `error-${day}.log`);
    const live = path.join(LOG_ROOT, "app", "error.log");
    if (fileHasContent(dated)) {
      return { filePath: dated, type: "error", relPath: `app/error-${day}.log` };
    }
    if (fileHasContent(live)) {
      return { filePath: live, type: "error", relPath: "app/error.log" };
    }
    const newest = findNewestLogInDir("app", { prefix: "error" });
    if (newest) return { filePath: newest.filePath, type: "error", relPath: newest.relPath };
    return { filePath: live, type: "error", relPath: "app/error.log" };
  }

  if (type === "crash") {
    const preferred = path.join(LOG_ROOT, "crash", `crash-${day}.log`);
    if (fileHasContent(preferred)) {
      return { filePath: preferred, type: "crash", relPath: `crash/crash-${day}.log` };
    }
    const newest = findNewestLogInDir("crash", { prefix: "crash" });
    if (newest) return { filePath: newest.filePath, type: "crash", relPath: newest.relPath };
    return { filePath: preferred, type: "crash", relPath: `crash/crash-${day}.log` };
  }

  if (type === "pm2") {
    const dated = path.join(LOG_ROOT, "pm2", `out-${day}.log`);
    const live = path.join(LOG_ROOT, "pm2", "out.log");
    if (fileHasContent(dated)) {
      return { filePath: dated, type: "pm2", relPath: `pm2/out-${day}.log` };
    }
    if (fileHasContent(live)) {
      return { filePath: live, type: "pm2", relPath: "pm2/out.log" };
    }
    const newest = findNewestLogInDir("pm2", { prefix: "out" });
    if (newest) return { filePath: newest.filePath, type: "pm2", relPath: newest.relPath };
    return { filePath: live, type: "pm2", relPath: "pm2/out.log" };
  }

  return null;
}

function parseLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return { raw: line };
  }
}

function readLines(filePath, { limit, from = "tail" } = {}) {
  if (!fs.existsSync(filePath)) return { lines: [], totalLines: 0 };

  const content = fs.readFileSync(filePath, "utf8");
  if (!content) return { lines: [], totalLines: 0 };

  const all = content.split("\n").filter((l) => l.trim().length > 0);
  const totalLines = all.length;
  const slice = from === "head" ? all.slice(0, limit) : all.slice(-limit);

  return { lines: slice.map(parseLine), totalLines };
}

function walkLogFiles(dirRelative, acc = []) {
  const full = path.join(LOG_ROOT, dirRelative);
  if (!fs.existsSync(full)) return acc;

  for (const name of fs.readdirSync(full)) {
    const filePath = path.join(full, name);
    const rel = path.join(dirRelative, name).replace(/\\/g, "/");
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      walkLogFiles(rel, acc);
      continue;
    }
    if (!stat.isFile() || !name.endsWith(".log")) continue;

    const parts = rel.split("/");
    const surface =
      parts[0] === "access" && parts.length >= 3 ? parts[1] : null;

    acc.push({
      dir: parts[0],
      surface,
      name,
      path: rel,
      sizeBytes: stat.size,
      sizeKb: Math.round((stat.size / 1024) * 10) / 10,
      mtime: new Date(stat.mtimeMs).toISOString(),
      isLive: CONTINUOUS_LOGS.some(
        (c) => path.join(LOG_ROOT, c.dir, c.name) === filePath
      ),
    });
  }

  return acc;
}

const listLogFilesService = async () => {
  const files = [];
  for (const dir of LOG_DIRS) {
    walkLogFiles(dir, files);
  }

  files.sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
  return {
    retentionDays: LOG_MAX_DAYS,
    surfaces: SURFACES,
    files,
  };
};

const getLogsService = async ({
  type = "access",
  date,
  file,
  limit = 200,
  keyword,
  level,
  from = "tail",
  surface,
}) => {
  if (!VALID_TYPES.has(type) && !file) {
    return { success: false, message: "invalid_log_type" };
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 5000);
  const readFrom = from === "head" ? "head" : "tail";
  const resolved = resolveLogFile({ type, date, file, surface });

  if (!resolved) {
    return { success: false, message: "log_file_not_found" };
  }

  const displayPath =
    resolved.relPath || path.relative(LOG_ROOT, resolved.filePath).replace(/\\/g, "/");

  if (!fs.existsSync(resolved.filePath)) {
    return {
      success: true,
      file: displayPath,
      type: resolved.type,
      entries: [],
      meta: {
        total: 0,
        limit: safeLimit,
        from: readFrom,
        totalLines: 0,
        surface: surface || null,
      },
    };
  }

  const { lines: allEntries, totalLines } = readLines(resolved.filePath, {
    limit: 20000,
    from: "head",
  });

  let entries = allEntries;

  // Only needed when reading a combined "all" file with a surface filter
  if (surface && displayPath.includes("/all/")) {
    entries = entries.filter((e) => e.surface === surface);
  }

  if (keyword) {
    const q = String(keyword).toLowerCase();
    entries = entries.filter((e) =>
      JSON.stringify(e).toLowerCase().includes(q)
    );
  }

  if (level) {
    const lv = String(level).toUpperCase();
    entries = entries.filter(
      (e) => String(e.level || "").toUpperCase() === lv
    );
  }

  if (entries.length > safeLimit) {
    entries =
      readFrom === "head"
        ? entries.slice(0, safeLimit)
        : entries.slice(-safeLimit);
  }

  return {
    success: true,
    file: displayPath,
    type: resolved.type,
    entries,
    meta: {
      total: entries.length,
      limit: safeLimit,
      from: readFrom,
      totalLines,
      surface: surface || null,
      retentionDays: LOG_MAX_DAYS,
    },
  };
};

module.exports = {
  listLogFilesService,
  getLogsService,
  VALID_TYPES,
};
