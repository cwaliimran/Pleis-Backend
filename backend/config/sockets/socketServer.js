// config/sockets/socketServer.js
const http = require("http");
const { Server } = require("socket.io");
const { initializeSockets } = require("./index");
const { isOriginAllowed } = require("../origins");

function createSocketServer(app, allowedOrigins) {
  const server = http.createServer(app);

  const io = new Server(server, {
    cors: {
      // Mirror HTTP CORS: exact allowlist + CF tunnels outside prod
      origin: (origin, callback) => {
        if (isOriginAllowed(origin)) return callback(null, true);
        return callback(new Error("CORS Forbidden"), false);
      },
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      credentials: true,
    },
  });

  // expose ONCE, globally
  global.io = io;

  initializeSockets(io);
             
  return server;
}

module.exports = { createSocketServer };
