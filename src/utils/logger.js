/**
 * Structured Console Logger with timestamps and colored tags
 */

export const logger = {
  info: (msg, ...args) => {
    console.log(`[\x1b[36mINFO\x1b[0m] [${new Date().toLocaleTimeString()}] ${msg}`, ...args);
  },
  success: (msg, ...args) => {
    console.log(`[\x1b[32mSUCCESS\x1b[0m] [${new Date().toLocaleTimeString()}] ${msg}`, ...args);
  },
  warn: (msg, ...args) => {
    console.warn(`[\x1b[33mWARN\x1b[0m] [${new Date().toLocaleTimeString()}] ${msg}`, ...args);
  },
  error: (msg, ...args) => {
    console.error(`[\x1b[31mERROR\x1b[0m] [${new Date().toLocaleTimeString()}] ${msg}`, ...args);
  },
  debug: (msg, ...args) => {
    if (process.env.DEBUG === 'true') {
      console.log(`[\x1b[35mDEBUG\x1b[0m] [${new Date().toLocaleTimeString()}] ${msg}`, ...args);
    }
  }
};

export default logger;
