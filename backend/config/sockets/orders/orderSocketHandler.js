const mongoose = require("mongoose");

function orderSocketHandler(io, role) {
  io.on("connection", (socket) => {
    const auth = socket.handshake.auth || {};
    const query = socket.handshake.query || {};

    const userId = auth.userId || query.userId;
    const organizationId = auth.organizationId || query.organizationId;

    const { Types } = mongoose;

    /* ======================================================
       1️⃣ VALIDATE USER (REQUIRED FOR ALL ROLES)
       ====================================================== */
    if (!Types.ObjectId.isValid(userId)) {
      console.warn("❌ Socket rejected: invalid userId", { userId, role });
      socket.disconnect(true);
      return;
    }

    /* ======================================================
       2️⃣ USER SOCKET (NO ORGANIZATION REQUIRED)
       ====================================================== */
    if (role === "user") {
      socket.join(`user:${String(userId)}`);


      socket.on("disconnect", () => {
      });

      return;
    }

    /* ======================================================
       3️⃣ STAFF / ADMIN / ORGANIZER SOCKETS
       (ORGANIZATION IS REQUIRED)
       ====================================================== */
    if (!Types.ObjectId.isValid(organizationId)) {
      console.warn("❌ Socket rejected: missing or invalid organizationId", {
        userId,
        organizationId,
        role,
      });
      socket.disconnect(true);
      return;
    }

    socket.join(`org:${String(organizationId)}`);


    socket.on("disconnect", () => {
    });
  });
}

module.exports = { orderSocketHandler };
