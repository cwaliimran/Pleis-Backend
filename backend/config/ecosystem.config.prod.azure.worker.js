/**
 * Azure App Service — Worker role (crons + BullMQ consumers + backup).
 *
 * Target app name (create manually): Pleis-worker
 * Prefer direct Node on Azure (same as API — avoid pm2-runtime restart loops).
 *
 * Startup command: npm run pm2:azure:prod:worker
 *   → APP_ROLE=worker NODE_ENV=prod node backend/server.js
 *
 * App Settings:
 *   APP_ROLE=worker
 *   NODE_ENV=prod
 *   Same secrets as API (MONGO, REDIS, MONRI_*, Billko, BASE_URL, etc.)
 *   Do NOT override PORT with a local-dev value; let Azure inject PORT.
 * Keep scale-out at 1 instance so crons are not multiplied.
 */
module.exports = {
  apps: [
    {
      name: "pleis-backend-worker",

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
        APP_ROLE: "worker",
      },
    },
  ],
};
