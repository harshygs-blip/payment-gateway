import { config } from '../../config.js';
import logger from '../utils/logger.js';

/**
 * Middleware to protect all Admin routes using the Master Key.
 * Checks for:
 * 1. Header: 'x-admin-key: shivambhatt@admin'
 * 2. Header: 'Authorization: Bearer <master-key>'
 * 3. Query: '?admin_key=<master-key>'
 */
export function adminAuth(req, res, next) {
  let clientKey = req.headers['x-admin-key'] || req.query.admin_key;

  if (!clientKey && req.headers.authorization) {
    const auth = req.headers.authorization.trim();
    if (auth.startsWith('Bearer ')) {
      clientKey = auth.substring(7).trim();
    } else {
      clientKey = auth;
    }
  }

  const expectedKey = config.adminSecret || 'shivambhatt@admin';

  if (!clientKey || clientKey !== expectedKey) {
    logger.warn(`[AdminAuth] Unauthorized access attempt to ${req.method} ${req.originalUrl}`);
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid or missing Master Key. Access Denied.'
    });
  }

  req.adminAuthenticated = true;
  return next();
}

export default adminAuth;
