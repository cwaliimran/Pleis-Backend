/**
 * Azure App Service — API role (public HTTP).
 *
 * Prefer direct Node on Azure (pm2-runtime was restart-looping on DEV).
 * This file is kept for reference / optional local pm2 use — do not switch
 * Azure to cluster mode (multiple workers fight over one PORT).
 *
 * Startup command (API app): npm run pm2:azure:prod
 *   → APP_ROLE=api NODE_ENV=prod node backend/server.js
 *
 * App Settings (Azure Portal / Configuration):
 *   APP_ROLE=api
 *   NODE_ENV=prod
 *   Do NOT set PORT to a local value; let Azure inject PORT.
 *   (plus existing MONGO/REDIS/MONRI/Billko/BASE_URL/etc.)
 *
 * Rollout: leave APP_ROLE unset (defaults to all) until the worker
 * app is healthy, then set APP_ROLE=api on this app.
 */
module.exports = {
  apps: [
    {
      name: "pleis-backend",

      script: "backend/server.js",

      exec_mode: "fork",
      instances: 1,

      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,

      max_memory_restart: "1024M",

      listen_timeout: 10000,
      kill_timeout: 5000,

      node_args: "--max-old-space-size=1024",

      output: "/dev/stdout",
      error: "/dev/stderr",

      env: {
        NODE_ENV: "prod",
        APP_ROLE: "api",
      },
    },
  ],
};
