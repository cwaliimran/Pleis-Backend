const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { User } = require("../../../models/UserModel");
const { ADMIN_LOGS_ROOM } = require("../../logging/logEmitter");
const { SURFACES } = require("../../logging/resolveSurface");

const VALID_SOURCES = new Set(["access", "app", "error", "crash", "pm2"]);
const VALID_SURFACES = new Set(SURFACES);

/**
 * Admin live log preview socket.
 * Connect: io("/admin/logs", { auth: { token } })
 * Optional: socket.emit("subscribe", {
 *   sources: ["access","app","error"],
 *   surfaces: ["admin","app","organizer","staff"] // optional; omit = all surfaces
 * })
 * Events: LOG_EVENT { source, surface, entry, timestamp }
 */
function adminLogsSocketHandler(io) {
  io.on("connection", async (socket) => {
    const auth = socket.handshake.auth || {};
    const query = socket.handshake.query || {};
    const rawToken = auth.token || query.token || "";
    const token = String(rawToken).replace(/^Bearer\s+/i, "");

    if (!token) {
      console.warn("❌ Admin logs socket rejected: missing token");
      socket.disconnect(true);
      return;
    }

    let userId;
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      userId = decoded._id || decoded.id;
    } catch (err) {
      console.warn("❌ Admin logs socket rejected: invalid token", err.message);
      socket.disconnect(true);
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      socket.disconnect(true);
      return;
    }

    const user = await User.findById(userId)
      .select("accountState.userType accountState.status")
      .lean();

    const userType = user?.accountState?.userType;
    const status = user?.accountState?.status;

    if (!user || userType !== "admin") {
      console.warn("❌ Admin logs socket rejected: not admin", { userId, userType });
      socket.disconnect(true);
      return;
    }

    if (
      status === "restricted" ||
      status === "suspended" ||
      status === "deleted"
    ) {
      socket.disconnect(true);
      return;
    }

    socket.join(ADMIN_LOGS_ROOM);

    const applySubscription = (payload = {}) => {
      const sources = Array.isArray(payload.sources)
        ? payload.sources.filter((s) => VALID_SOURCES.has(s))
        : ["access", "app", "error"];

      const surfaces = Array.isArray(payload.surfaces)
        ? payload.surfaces.filter((s) => VALID_SURFACES.has(s))
        : [];

      // Leave previous rooms
      for (const prev of socket.data.adminLogsRooms || []) {
        socket.leave(prev);
      }

      const rooms = [];
      for (const source of sources) {
        if (source === "access" && surfaces.length > 0) {
          for (const surface of surfaces) {
            const room = `${ADMIN_LOGS_ROOM}:${source}:${surface}`;
            socket.join(room);
            rooms.push(room);
          }
        } else {
          const room = `${ADMIN_LOGS_ROOM}:${source}`;
          socket.join(room);
          rooms.push(room);
        }
      }

      socket.data.adminLogsSources = sources;
      socket.data.adminLogsSurfaces = surfaces;
      socket.data.adminLogsRooms = rooms;

      socket.emit("subscribed", { sources, surfaces: surfaces.length ? surfaces : "all" });
    };

    socket.on("subscribe", applySubscription);

    // Default: all sources, all surfaces
    applySubscription({ sources: ["access", "app", "error"] });
  });
}

module.exports = { adminLogsSocketHandler };
