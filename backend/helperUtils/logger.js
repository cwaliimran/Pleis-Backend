
/* 
logger.log("Debug message");   // prints only in non-production
logger.info("Some info");      // prints only in non-production
logger.warn("Warning message"); // always prints
logger.error("Error message");  // always prints
*/

const isProd = process.env.NODE_ENV === "prod";

const logger = {
    log: (...args) => {
        if (!isProd) {
            console.log(...args);
        }
    },
    info: (...args) => {
        if (!isProd) {
            console.info(...args);
        }
    },
    warn: (...args) => {
        console.warn(...args); // keep warnings always
    },
    error: (...args) => {
        console.error(...args); // keep errors always
    },
};

module.exports = logger;
