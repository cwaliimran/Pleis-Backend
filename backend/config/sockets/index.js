const { attachRedisAdapter } = require("./socketRedisAdapter");
const { orderSocketHandler } = require("./orders/orderSocketHandler");

function initializeSockets(io) {
  attachRedisAdapter(io);

  orderSocketHandler(io.of("/staff/orders"), "staff");
  orderSocketHandler(io.of("/admin/orders"), "admin");
  orderSocketHandler(io.of("/organizer/orders"), "organizer");
  orderSocketHandler(io.of("/user/orders"), "user");

  console.log("🚀 Order sockets initialized");
}


module.exports = { initializeSockets };
