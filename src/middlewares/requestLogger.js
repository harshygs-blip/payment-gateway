import logger from '../utils/logger.js';

/**
 * Clean HTTP Request Logger Middleware
 */
export function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const method = req.method;
    const url = req.originalUrl;

    // Filter noisy static asset and socket.io polling requests from spamming logs
    if (url.startsWith('/css') || url.startsWith('/js') || url.startsWith('/favicon') || url.startsWith('/socket.io')) {
      return;
    }

    if (status >= 400) {
      logger.warn(`${method} ${url} -> ${status} (${duration}ms)`);
    } else {
      logger.info(`${method} ${url} -> ${status} (${duration}ms)`);
    }
  });
  next();
}

export default requestLogger;
