const mongoose = require("mongoose");

function orderSocketHandler(io, role) {
  io.on("connection", (socket) => {
    const auth = socket.handshake.auth || {};
    const query = socket.handshake.query || {};

    const userId = auth.userId || query.userId;
    const organizationId = auth.organizationId || query.organizationId;

    const { Types } = mongoose;

    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(organizationId)) {
      console.error(`❌ Invalid connection attempt to ${role} socket`, {
        userId,
        organizationId,
      });
      socket.disconnect(true);
      return;
    }

    // ✅ Join rooms
    socket.join(`org:${String(organizationId)}`);
    socket.join(`user:${String(userId)}`);

    console.log(`🟢 ${role} connected`, {
      userId,
      organizationId,
      socketId: socket.id,
    });

    socket.on("disconnect", () => {
      console.log(`🔴 ${role} disconnected`, { userId, organizationId });
    });
  });
}

module.exports = { orderSocketHandler };
