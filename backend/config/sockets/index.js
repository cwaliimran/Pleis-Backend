const { attachRedisAdapter } = require("./socketRedisAdapter");
const { orderSocketHandler } = require("./orders/orderSocketHandler");

function initializeSockets(io) {
  attachRedisAdapter(io);

  orderSocketHandler(io.of("/orders/staff"), "staff");
  orderSocketHandler(io.of("/orders/admin"), "admin");
  orderSocketHandler(io.of("/orders/organizer"), "organizer");
  orderSocketHandler(io.of("/orders/user"), "user");

  console.log("🚀 Order sockets initialized");
}


module.exports = { initializeSockets };
