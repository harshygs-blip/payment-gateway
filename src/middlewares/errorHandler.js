import logger from '../utils/logger.js';
import { logActivity } from '../../db/database.js';

/**
 * Centralized API Error Handling Middleware
 */
export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  // Handle JSON parse syntax errors from express.json()
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    logger.warn(`[JSON Parse Error] ${req.method} ${req.originalUrl}: Malformed JSON in request body`);
    return res.status(400).json({
      success: false,
      error: 'Malformed JSON payload in request body. Please verify JSON formatting.',
      code: 'INVALID_JSON',
      statusCode: 400,
      timestamp: new Date().toISOString()
    });
  }

  // Handle CORS rejection errors
  if (err.message && err.message.includes('CORS blocked')) {
    logger.warn(`[CORS Error] ${req.method} ${req.originalUrl}: ${err.message}`);
    logActivity({
      eventType: 'CORS_BLOCKED',
      status: 'FAILED',
      title: 'CORS Origin Blocked',
      details: err.message,
      clientIp: req.ip || '',
      origin: req.headers.origin || ''
    });
    return res.status(403).json({
      success: false,
      error: err.message,
      code: 'CORS_NOT_ALLOWED',
      statusCode: 403,
      timestamp: new Date().toISOString()
    });
  }

  logger.error(`[${req.method}] ${req.originalUrl} - ${err.message}`, { stack: err.stack });

  let statusCode = typeof res.status === 'function' 
    ? (err.statusCode || (res.statusCode !== 200 ? res.statusCode : 500))
    : 500;

  if (err.message && err.message.includes('CORS blocked')) {
    statusCode = 403;
  }

  const errorCode = err.code || (
    statusCode === 404 ? 'NOT_FOUND' :
    statusCode === 403 ? 'CORS_FORBIDDEN' :
    statusCode === 401 ? 'UNAUTHORIZED' :
    statusCode === 400 ? 'BAD_REQUEST' :
    statusCode === 409 ? 'CONFLICT' :
    statusCode === 410 ? 'ORDER_EXPIRED' :
    statusCode === 422 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR'
  );

  // Log unexpected internal server errors to activity log for admin visibility
  if (statusCode >= 500) {
    logActivity({
      eventType: 'SERVER_ERROR',
      status: 'FAILED',
      title: `Internal Error on ${req.method} ${req.originalUrl}`,
      details: err.message,
      clientIp: req.ip || '',
      origin: req.headers.origin || ''
    });
  }

  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(statusCode).json({
      success: false,
      error: err.message || 'Internal Server Error',
      code: errorCode,
      statusCode,
      timestamp: new Date().toISOString(),
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

  return res.status(404).json({
    success: false,
    error: `Endpoint not found: ${req.method} ${req.originalUrl}`,
    code: 'ROUTE_NOT_FOUND',
    statusCode: 404,
    timestamp: new Date().toISOString()
  });
}

export default { errorHandler, notFoundHandler };
