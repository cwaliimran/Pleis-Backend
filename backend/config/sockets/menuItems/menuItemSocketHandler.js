const mongoose = require("mongoose");

function menuItemSocketHandler(io) {
  io.on("connection", (socket) => {
    const auth = socket.handshake.auth || {};
    const query = socket.handshake.query || {};

    const userId = auth.userId || query.userId;
    const organizationId = auth.organizationId || query.organizationId;
    const { Types } = mongoose;

    if (!Types.ObjectId.isValid(userId)) {
      console.warn("❌ Menu socket rejected: invalid userId", { userId });
      socket.disconnect(true);
      return;
    }

    if (!Types.ObjectId.isValid(organizationId)) {
      console.warn("❌ Menu socket rejected: invalid organizationId", {
        userId,
        organizationId,
      });
      socket.disconnect(true);
      return;
    }

    socket.join(`org:${String(organizationId)}`);
  });
}

module.exports = { menuItemSocketHandler };
