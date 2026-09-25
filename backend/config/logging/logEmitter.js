/**
 * Push live log events to admin socket subscribers.
 * Always emit when Socket.IO is up — Redis adapter fans out across instances.
 */

const ADMIN_LOGS_NSP = "/admin/logs";
const ADMIN_LOGS_ROOM = "admin:logs";

/**
 * @param {string} source - access | app | error | crash | pm2
 * @param {object} entry
 * @param {{ surface?: string }} [opts]
 */
function emitLogEvent(source, entry, opts = {}) {
  try {
    const io = global.io;
    if (!io) return;

    const surface = opts.surface || entry.surface || null;
    const payload = {
      source,
      surface,
      entry,
      timestamp: Date.now(),
    };

    const nsp = io.of(ADMIN_LOGS_NSP);
    nsp.to(`${ADMIN_LOGS_ROOM}:${source}`).emit("LOG_EVENT", payload);

    if (surface) {
      nsp
        .to(`${ADMIN_LOGS_ROOM}:${source}:${surface}`)
        .emit("LOG_EVENT", payload);
    }
  } catch (_) {
    // Never let logging side-effects break request flow
  }
}

module.exports = {
  emitLogEvent,
  ADMIN_LOGS_NSP,
  ADMIN_LOGS_ROOM,
};
