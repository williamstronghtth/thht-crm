/**
 * API Key Authentication
 * 
 * Supports two modes:
 * 1. API key auth for programmatic/agent access (header-based)
 * 2. No-auth browser access for Chris at the existing Render URL
 * 
 * Config via env:
 *   CRM_API_KEYS = JSON array of {key, name, role}
 *   Example: [{"key":"sk_chris_xxx","name":"Chris Hoover","role":"admin"},{"key":"sk_william_xxx","name":"William Strong","role":"admin"},{"key":"sk_jack_xxx","name":"Jack","role":"member"}]
 */

const crypto = require('crypto');

function parseApiKeys() {
  const raw = process.env.CRM_API_KEYS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter(k => k && k.key && k.name);
  } catch (err) {
    console.error('Failed to parse CRM_API_KEYS:', err.message);
  }
  return [];
}

const apiKeys = parseApiKeys();

/**
 * Generate a new API key
 */
function generateApiKey(prefix = 'sk') {
  return `${prefix}_${crypto.randomBytes(20).toString('hex')}`;
}

/**
 * Find API key entry by key string
 */
function findByKey(key) {
  if (!key) return null;
  return apiKeys.find(k => k.key === key) || null;
}

/**
 * Extract API key from request
 * Supports:
 *   Authorization: Bearer <key>
 *   X-API-Key: <key>
 *   ?api_key=<key> (query param, less secure but convenient)
 */
function extractKey(req) {
  // Authorization header
  const auth = req.headers['authorization'] || '';
  if (auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  
  // X-API-Key header
  if (req.headers['x-api-key']) {
    return req.headers['x-api-key'].trim();
  }
  
  // Query param fallback
  if (req.query && req.query.api_key) {
    return req.query.api_key.trim();
  }
  
  return null;
}

/**
 * API auth middleware
 * 
 * Strategy:
 * - If CRM_API_KEYS is not set: no auth enforced (backward compatible)
 * - If CRM_API_KEYS is set:
 *   - API requests (Accept: application/json or /api/* paths) require valid key
 *   - Browser requests (HTML) pass through for Chris's direct access
 */
function apiAuthMiddleware(req, res, next) {
  // If no API keys configured, skip auth entirely (backward compatible)
  if (apiKeys.length === 0) return next();
  
  // Health/status endpoints are always public
  const publicPaths = ['/healthz', '/api/status', '/login', '/logout'];
  if (publicPaths.includes(req.path)) return next();
  
  // Non-API paths (HTML pages, static assets) pass through for browser access
  if (!req.path.startsWith('/api/')) return next();
  
  // If already authenticated via session (browser), allow through
  if (req.user) return next();
  
  // API paths require key auth
  const key = extractKey(req);
  if (!key) {
    return res.status(401).json({ 
      error: 'API key required',
      hint: 'Send via Authorization: Bearer <key> or X-API-Key header'
    });
  }
  
  const entry = findByKey(key);
  if (!entry) {
    return res.status(403).json({ error: 'Invalid API key' });
  }
  
  // Attach user info to request
  req.apiUser = {
    name: entry.name,
    role: entry.role || 'member',
    key: key.slice(0, 8) + '...'  // truncated for logs
  };
  
  next();
}

/**
 * Get list of configured API users (without exposing full keys)
 */
function getApiUsers() {
  return apiKeys.map(k => ({
    name: k.name,
    role: k.role || 'member',
    keyPrefix: k.key.slice(0, 8) + '...'
  }));
}

module.exports = {
  apiAuthMiddleware,
  generateApiKey,
  getApiUsers,
  extractKey,
  findByKey,
};
