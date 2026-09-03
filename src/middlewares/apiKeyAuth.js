import { config } from '../../config.js';
import logger from '../utils/logger.js';

/**
 * Middleware to authenticate merchant requests using an API Key.
 * Checks for:
 * 1. Header: 'x-api-key: pg_live_...'
 * 2. Header: 'Authorization: Bearer pg_live_...'
 * 3. Query: '?api_key=pg_live_...'
 */
export function apiKeyAuth(req, res, next) {
  // If API Key enforcement is turned off in settings, allow all requests
  if (!config.auth || !config.auth.requireApiKey) {
    req.apiKeyAuthenticated = false;
    return next();
  }

  // Extract key from header or query
  let clientKey = req.headers['x-api-key'] || req.query.api_key || req.query.apiKey;

  if (!clientKey && req.headers.authorization) {
    const authHeader = req.headers.authorization.trim();
    if (authHeader.startsWith('Bearer ')) {
      clientKey = authHeader.substring(7).trim();
    } else {
      clientKey = authHeader;
    }
  }

  const expectedKey = config.auth?.apiKey;

  if (!clientKey) {
    logger.warn(`[Auth] Blocked request to ${req.method} ${req.originalUrl}: Missing API Key`);
    return res.status(401).json({
      success: false,
      error: "Unauthorized: Missing API Key. Provide your API Key in the 'x-api-key' header or 'Authorization: Bearer <key>'."
    });
  }

  if (clientKey !== expectedKey) {
    logger.warn(`[Auth] Blocked request to ${req.method} ${req.originalUrl}: Invalid API Key supplied`);
    return res.status(401).json({
      success: false,
      error: "Unauthorized: Invalid API Key. Please verify your API Key from the Admin Dashboard."
    });
  }

  req.apiKeyAuthenticated = true;
  return next();
}

export default apiKeyAuth;
