/**
 * Process role for modular-monolith deploy split (API vs background worker).
 *
 * APP_ROLE:
 *   - all    (default) — HTTP + crons + BullMQ workers + backup (local / unchanged)
 *   - api    — HTTP + Socket.IO + BullMQ enqueue only (no consumers/crons/backup)
 *   - worker — DB/Redis + crons + BullMQ consumers + backup (HTTP kept for Azure /health)
 */

const VALID_ROLES = new Set(["api", "worker", "all"]);

function getAppRole() {
  const raw = String(process.env.APP_ROLE || "all")
    .trim()
    .toLowerCase();
  return VALID_ROLES.has(raw) ? raw : "all";
}

/** True when this process should serve the public HTTP API + sockets. */
function shouldRunHttp() {
  const role = getAppRole();
  // Worker keeps a listener for Azure Always On /health probes.
  return role === "api" || role === "worker" || role === "all";
}

/** True when this process should run crons, BullMQ consumers, and backup. */
function shouldRunBackgroundJobs() {
  const role = getAppRole();
  return role === "worker" || role === "all";
}

module.exports = {
  getAppRole,
  shouldRunHttp,
  shouldRunBackgroundJobs,
};
