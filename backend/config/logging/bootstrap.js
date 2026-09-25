const { ensureLogDirs, runLogCleanup } = require("./logCleanup");

// Ensure dirs + age-based cleanup on process boot (rotation left to daily cron)
ensureLogDirs();
try {
  runLogCleanup({ rotate: false });
} catch (err) {
  console.error("[log-cleanup] bootstrap cleanup failed:", err.message);
}
