const { attachRedisAdapter } = require("./socketRedisAdapter");
const { orderSocketHandler } = require("./orders/orderSocketHandler");
const { menuItemSocketHandler } = require("./menuItems/menuItemSocketHandler");

function initializeSockets(io) {
  attachRedisAdapter(io);

  orderSocketHandler(io.of("/staff/orders"), "staff");
  orderSocketHandler(io.of("/admin/orders"), "admin");
  orderSocketHandler(io.of("/organizer/orders"), "organizer");
  orderSocketHandler(io.of("/user/orders"), "user");

  menuItemSocketHandler(io.of("/user/menu"));
  menuItemSocketHandler(io.of("/staff/menu"));
  menuItemSocketHandler(io.of("/admin/menu"));
  menuItemSocketHandler(io.of("/organizer/menu"));

  console.log("🚀 Order sockets initialized");
}


module.exports = { initializeSockets };
