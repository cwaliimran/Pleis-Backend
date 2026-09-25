const fs = require("fs");
const path = require("path");
const { emitLogEvent } = require("./logEmitter");
const { LOG_ROOT } = require("./logPaths");

const isProd = process.env.NODE_ENV === "prod";
const LOG_DIR = path.join(LOG_ROOT, "app");

function write(level, message, meta = {}) {
  const entry = {
    time: new Date().toISOString(),
    level,
    pid: process.pid,
    workerId: process.env.NODE_APP_INSTANCE,
    message,
    ...meta,
  };

  const line = JSON.stringify(entry) + "\n";
  const source = level === "ERROR" || level === "WARN" ? "error" : "app";

  try {
    if (source === "error") {
      fs.appendFileSync(path.join(LOG_DIR, "error.log"), line);
    } else {
      fs.appendFileSync(path.join(LOG_DIR, "app.log"), line);
    }
  } catch (_) {}

  console.log(line.trim());
  emitLogEvent(source, entry);
}

module.exports = {
  log: (msg, meta) => !isProd && write("DEBUG", msg, meta),
  info: (msg, meta) => write("INFO", msg, meta),
  warn: (msg, meta) => write("WARN", msg, meta),
  error: (msg, meta) => write("ERROR", msg, meta),
};
