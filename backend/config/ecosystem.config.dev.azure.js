module.exports = {
  apps: [
    {
      name: "pleis-backend",

      script: "backend/server.js",

      /**
       * Azure App Service requires fork mode
       * Cluster mode causes port conflicts
       */
      exec_mode: "fork",
      instances: 1,

      /**
       * Restart protection
       */
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,

      /**
       * Startup / shutdown safety
       */
      listen_timeout: 10000,
      kill_timeout: 5000,

      /**
       * Memory protection
       */
      max_memory_restart: "1024M",

      /**
       * Increase Node heap size
       */
      node_args: "--max-old-space-size=1024",

      /**
       * Logging
       * Azure collects stdout/stderr automatically
       */
      output: "/dev/stdout",
      error: "/dev/stderr",
      merge_logs: true,
      time: true,

      /**
       * Environment variables
       */
      env: {
        NODE_ENV: "dev",
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

      listen_timeout: 10000,
      kill_timeout: 8000,

      max_memory_restart: "512M",

      node_args: "--max-old-space-size=512",

      output: "/dev/stdout",
      error: "/dev/stderr",
      merge_logs: true,
      time: true,

      env: {
        NODE_ENV: "dev",
        PROCESS_ROLE: "worker",
      },
    },
  ],
};
