const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const COOKIE_NAME = 'thhtcrm_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12h
const sessions = new Map();

function parseUsers() {
  const raw = process.env.CRM_USERS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map(normalizeUser).filter(Boolean);
      }
    } catch (err) {
      console.error('Failed to parse CRM_USERS:', err.message);
    }
  }

  const fallback = [
    process.env.CRM_ADMIN_EMAIL && process.env.CRM_ADMIN_PASSWORD ? {
      email: process.env.CRM_ADMIN_EMAIL,
      password: process.env.CRM_ADMIN_PASSWORD,
      name: process.env.CRM_ADMIN_NAME || 'Chris Hoover',
      role: 'admin'
    } : null
  ].filter(Boolean);

  return fallback.map(normalizeUser).filter(Boolean);
}

function normalizeUser(user) {
  if (!user || !user.email || !user.password) return null;
  return {
    email: String(user.email).trim().toLowerCase(),
    password: String(user.password),
    name: user.name || user.email,
    role: user.role || 'member'
  };
}

const users = parseUsers();
const passwordCache = new Map();

function findUser(email) {
  return users.find((u) => u.email === String(email || '').trim().toLowerCase());
}

async function verifyPassword(plain, stored) {
  if (!stored) return false;
  if (stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$')) {
    return bcrypt.compare(plain, stored);
  }
  return plain === stored;
}

function createSession(user) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, {
    email: user.email,
    name: user.name,
    role: user.role,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return token;
}

function getSession(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return session;
}

function clearSession(token) {
  if (token) sessions.delete(token);
}

function authMiddleware(req, res, next) {
  const publicPaths = new Set(['/healthz', '/login', '/logout', '/api/status']);
  if (publicPaths.has(req.path)) return next();
  if (req.path.startsWith('/assets/') || req.path === '/favicon.ico') return next();

  // If request has an API key header, let API auth middleware handle it
  if (req.path.startsWith('/api/') && (
    req.headers['authorization'] ||
    req.headers['x-api-key'] ||
    (req.query && req.query.api_key)
  )) {
    return next();
  }

  const session = getSession(req.cookies?.[COOKIE_NAME]);
  if (!session) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    return res.redirect('/login');
  }
  req.user = session;
  next();
}

async function handleLogin(req, res) {
  const { email, password } = req.body || {};
  const user = findUser(email);
  if (!user || !(await verifyPassword(password, user.password))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = createSession(user);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: SESSION_TTL_MS,
    path: '/'
  });
  return res.json({ success: true, user: { email: user.email, name: user.name, role: user.role } });
}

function handleLogout(req, res) {
  clearSession(req.cookies?.[COOKIE_NAME]);
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ success: true });
}

function getSafeUsers() {
  return users.map(({ password, ...rest }) => rest);
}

module.exports = {
  authMiddleware,
  handleLogin,
  handleLogout,
  getSession,
  COOKIE_NAME,
  getSafeUsers,
};
