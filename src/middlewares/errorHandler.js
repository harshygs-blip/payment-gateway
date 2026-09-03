import logger from '../utils/logger.js';

/**
 * Centralized API Error Handling Middleware
 */
export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  logger.error(`[${req.method}] ${req.originalUrl} - ${err.message}`);

  const statusCode = typeof res.status === 'function' 
    ? (err.statusCode || (res.statusCode !== 200 ? res.statusCode : 500))
    : 500;

  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(statusCode).json({
      success: false,
      error: err.message || 'Internal Server Error',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
  }

  return next(err);
}

/**
 * 404 Route Not Found Middleware
 */
export function notFoundHandler(req, res, next) {
  if (res.headersSent) {
    return next();
  }
  // Ignore Socket.IO internal polling routes
  if (req.originalUrl.startsWith('/socket.io/')) {
    return next();
  }

  res.status(404).json({
    success: false,
    error: `Endpoint not found: ${req.method} ${req.originalUrl}`
  });
}

export default { errorHandler, notFoundHandler };
