const crypto = require("crypto");

/**
 * In-memory dedupe store
 * Key: fingerprint
 * Value: lastSeen timestamp
 */
const recentCrashes = new Map();

const DEDUPE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

function fingerprint(err) {
  return crypto
    .createHash("sha1")
    .update(
      (err?.name || "") +
      (err?.message || "") +
      (err?.stack || "")
    )
    .digest("hex");
}

function shouldAlert(fp) {
  const now = Date.now();
  const last = recentCrashes.get(fp);

  if (last && now - last < DEDUPE_WINDOW_MS) {
    return false;
  }

  recentCrashes.set(fp, now);
  return true;
}

module.exports = {
  logCrash({ type, error }) {
    const fp = fingerprint(error);

    const payload = {
      time: new Date().toISOString(),
      type,
      pid: process.pid,
      workerId: process.env.NODE_APP_INSTANCE,
      fingerprint: fp,
      message: error?.message,
      stack: error?.stack,
      memory: process.memoryUsage(),
      uptime: process.uptime(),
    };

    // ALWAYS write crash log
    console.error(JSON.stringify(payload));

    // Alert only if not duplicate
    if (shouldAlert(fp)) {
      // sendSlack(payload)
      // sendEmail(payload)
      // sendAzureMonitor(payload)
    }
  },
};
