const { createAdapter } = require("@socket.io/redis-adapter");
const { createNewRedisClient } = require("../redis/redisConfig.js");

function attachRedisAdapter(io) {

  const pubClient = createNewRedisClient();
  const subClient = createNewRedisClient();

  io.adapter(createAdapter(pubClient, subClient));

  console.log("🔗 Socket.IO Redis adapter attached");
}

module.exports = { attachRedisAdapter };
