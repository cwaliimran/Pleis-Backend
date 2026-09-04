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
        PROCESS_ROLE: "web",
      },
    },
    /**
     * Same App Service as web (process split, not service split).
     * Does not bind PORT — Azure would conflict with pleis-backend.
     *
     * Step 5 scale-out of this App Service would start N workers too.
     * BullMQ is fine with N consumers; cron is Redis-locked. To pin
     * exactly one cron scheduler later, move this app to a
     * single-instance App Service (same codebase).
     */
    {
      name: "pleis-worker",

      script: "backend/worker.js",

      exec_mode: "fork",
      instances: 1,

      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,

      max_memory_restart: "512M",

      listen_timeout: 10000,
      kill_timeout: 8000,

      node_args: "--max-old-space-size=512",

      output: "/dev/stdout",
      error: "/dev/stderr",

      env: {
        NODE_ENV: "prod",
        PROCESS_ROLE: "worker",
      },
    },
  ],
};
