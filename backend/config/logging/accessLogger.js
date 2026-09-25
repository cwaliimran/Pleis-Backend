const fs = require("fs");
const path = require("path");
const { emitLogEvent } = require("./logEmitter");
const { LOG_ROOT, accessDayFile, accessSurfaceDir } = require("./logPaths");
const { resolveSurface } = require("./resolveSurface");
const { ensureLogDirs } = require("./logCleanup");

// Ensure per-role folders exist on first request after boot
ensureLogDirs();

module.exports = (req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const surface = resolveSurface(req.originalUrl);
    const day = new Date().toISOString().slice(0, 10);

    const entry = {
      time: new Date().toISOString(),
      surface,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - start,
      pid: process.pid,
      workerId: process.env.NODE_APP_INSTANCE,
    };

    const line = JSON.stringify(entry) + "\n";

    // logs/access/all/YYYY-MM-DD.log  +  logs/access/{surface}/YYYY-MM-DD.log
    const combined = accessDayFile("all", day);
    const bySurface = accessDayFile(surface, day);

    try {
      // mkdir in case a new surface appears
      fs.mkdirSync(path.dirname(combined), { recursive: true });
      fs.mkdirSync(path.dirname(bySurface), { recursive: true });
      fs.appendFileSync(combined, line);
      fs.appendFileSync(bySurface, line);
    } catch (_) {}

    emitLogEvent("access", entry, { surface });
  });

  next();
};
