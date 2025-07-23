const fs = require("fs");
const path = require("path");
const morgan = require("morgan");

// Constants
const logsDir = path.join(__dirname, "logs");
const MAX_LOG_BUFFER = 10_000;
const FLUSH_INTERVAL_MS = 5 * 60 * 60 * 1000; // 5 hours
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000;

// Ensure log directory exists
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Create log file stream
const logFilePath = path.join(
  logsDir,
  `access-${new Date().toISOString().slice(0, 10)}.log`
);
const accessLogStream = fs.createWriteStream(logFilePath, {
  flags: "a",
  encoding: "utf8",
  mode: 0o666,
  autoClose: true,
});

// Sensitive key sanitizer
let sensitiveKeys = [];
if (process.env.NODE_ENV == "prod") {
  sensitiveKeys = [
    "password",
    "confirmPassword",
    "newPassword",
    "oldPassword",
    "token",
  ];
}
const sanitize = (obj) => {
  if (!obj || typeof obj !== "object") return obj;
  const clone = Array.isArray(obj) ? [...obj] : { ...obj };
  for (const key in clone) {
    if (sensitiveKeys.includes(key)) {
      clone[key] = "***";
    } else if (typeof clone[key] === "object") {
      clone[key] = sanitize(clone[key]);
    }
  }
  return clone;
};

// Buffer stream logic
const logBuffer = [];
const bufferStream = {
  write: (message) => {
    try {
      if (logBuffer.length < MAX_LOG_BUFFER) {
        logBuffer.push(message);
      } else {
        //write whaterever you have and clear the buffer
        accessLogStream.write(logBuffer.splice(0).join(""), "utf8", (err) => {
          if (err) console.error("Error writing to access log file:", err);
        });
        logBuffer.push(message); // Add the new message after flushing
      }
    } catch (err) {
      console.error("Failed to buffer log message:", err);
    }
  },
};

// Flush buffer to file periodically
setInterval(() => {
  try {
    if (logBuffer.length > 0) {
      const logsToWrite = logBuffer.splice(0).join("");
      accessLogStream.write(logsToWrite, "utf8", (err) => {
        if (err) console.error("Error writing to access log file:", err);
      });
    }
  } catch (err) {
    console.error("Unexpected error during log flushing:", err);
  }
}, FLUSH_INTERVAL_MS);

// Clean up old logs
setInterval(() => {
  fs.readdir(logsDir, (err, files) => {
    if (err) return console.error("Error reading logs directory:", err);
    files.forEach((file) => {
      if (file.startsWith("access-") && file.endsWith(".log")) {
        const filePath = path.join(logsDir, file);
        fs.stat(filePath, (err, stats) => {
          if (!err && Date.now() - stats.mtimeMs > ONE_WEEK_MS) {
            fs.unlink(filePath, (err) => {
              if (err)
                console.error("Error deleting old log file:", filePath, err);
            });
          }
        });
      }
    });
  });
}, CLEANUP_INTERVAL);

// Register custom tokens
morgan.token("ip", (req) => req.ip || req.connection?.remoteAddress);
morgan.token("body", (req) => JSON.stringify(sanitize(req.body || {})));
morgan.token("query", (req) => JSON.stringify(sanitize(req.query || {})));
morgan.token("params", (req) => JSON.stringify(sanitize(req.params || {})));

// Create morgan logger using custom format
const loggerMiddleware = morgan(
  ":ip :method :url :status :response-time ms\n - body: :body\n - query: :query\n - params: :params\n\n",
  { stream: bufferStream }
);

// Export middleware
module.exports = {
  loggerMiddleware,
};
