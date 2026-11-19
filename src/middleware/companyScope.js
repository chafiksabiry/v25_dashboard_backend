const jwt = require('jsonwebtoken');

/**
 * Authentication + company scoping for the company-facing routes.
 *
 *  - authenticateUser: requires a valid JWT issued by v25_registration_backend (claim `userId`).
 *    Copie du middleware du service des appels (v25_dash_calls_backend, src/middleware/companyScope.js).
 *    JWT_SECRET must be set: there is deliberately no fallback secret.
 *  - assertCompanyAccess: the caller must belong to the company they act on. The company of a user (owner or
 *    team member) is resolved by v25_registration_backend (`GET /api/company-members/me`), the source of truth.
 *
 * COMPANY_SCOPE_MODE=log turns the company check into a warning (escape hatch if the lookup misbehaves);
 * authentication stays enforced. Default: enforce.
 */

const LOOKUP_TIMEOUT_MS = 4000;
const CACHE_TTL_MS = 60 * 1000;
const companyByUser = new Map();

class ScopeError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function registrationOrigin() {
  const explicit = process.env.REGISTRATION_BACKEND_URL;
  const railway = process.env.RAILWAY_SERVICE_V25_REGISTRATION_BACKEND_URL;
  const raw = explicit || (railway ? (/^https?:\/\//i.test(railway) ? railway : `https://${railway}`) : '');
  return raw.replace(/\/+$/, '').replace(/\/api$/, '');
}

function bearerToken(req) {
  const header = req.headers && req.headers.authorization;
  return header && header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function authenticateUser(req, res, next) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('[companyScope] JWT_SECRET is not set: refusing every protected request');
    return res.status(500).json({ success: false, message: 'Authentication is not configured' });
  }
  const token = bearerToken(req);
  if (!token) return res.status(401).json({ success: false, message: 'Authentication required' });
  try {
    const decoded = jwt.verify(token, secret);
    const userId = decoded.userId || decoded.id;
    if (!userId) throw new Error('no user in token');
    req.auth = { userId: String(userId), token };
    return next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Authentication failed' });
  }
}

const idList = (v) => (Array.isArray(v) ? v.map((x) => String((x && (x.companyId || x._id)) || x || '')).filter(Boolean) : []);

/**
 * Session de l'appelant chez le service d'inscription (`GET /api/company-members/me`), un seul objet pour tous les contrôles :
 *  - `companyId` : entreprise principale. SEULE entreprise où l'appelant a le niveau « membre » (titulaire, droits, écoute) ;
 *  - `companyIds` : principale + autres centres d'un agent multi-centres (`companyIds`, emplois `status === 'active'` ; un emploi sans
 *    statut n'est pas actif). Une entreprise atteinte ainsi ne donne qu'un accès de niveau AGENT (voir middleware/access.js) ;
 *  - `isOwner`, `isAgent`, `isClient`, `permissions` : tels que /me les renvoie (globaux, valables pour l'entreprise principale).
 * Cache court (CACHE_TTL_MS) par utilisateur. Lève une ScopeError 503 si la session est illisible.
 */
async function callerSession(auth) {
  const cached = companyByUser.get(auth.userId);
  if (cached && cached.expires > Date.now()) return cached.session;

  const origin = registrationOrigin();
  if (!origin) throw new ScopeError(503, 'Company lookup is not configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const res = await fetch(`${origin}/api/company-members/me?userId=${encodeURIComponent(auth.userId)}`, {
      headers: { Authorization: `Bearer ${auth.token}` },
      signal: controller.signal,
    });
    if (!res.ok) throw new ScopeError(503, 'Company lookup failed');
    const payload = await res.json();
    const data = (payload && payload.data) || {};
    const companyId = data.companyId ? String(data.companyId) : null;
    const activeEmployments = (Array.isArray(data.employments) ? data.employments : []).filter((e) => e && e.status === 'active');
    const session = {
      companyId,
      companyIds: [...new Set([companyId, ...idList(data.companyIds), ...idList(activeEmployments)].filter(Boolean))],
      isOwner: data.isOwner === true,
      isAgent: data.isAgent === true,
      isClient: data.isClient === true,
      permissions: data.permissions && typeof data.permissions === 'object' ? { ...data.permissions } : {},
    };
    companyByUser.set(auth.userId, { session, expires: Date.now() + CACHE_TTL_MS });
    return session;
  } catch (error) {
    if (error instanceof ScopeError) throw error;
    throw new ScopeError(503, 'Company lookup failed');
  } finally {
    clearTimeout(timer);
  }
}

/** Même objet que callerSession (nom employé par les gardes des prospects). */
const callerMembership = callerSession;

async function callerCompanyId(auth) {
  return (await callerSession(auth)).companyId;
}

/** Throws a ScopeError unless the authenticated caller is a MEMBER of `companyId` (entreprise principale seulement). */
async function assertCompanyAccess(req, companyId) {
  if (!req.auth) throw new ScopeError(401, 'Authentication required');
  const mine = await callerCompanyId(req.auth);
  if (mine && companyId && String(mine) === String(companyId)) return;
  if (String(process.env.COMPANY_SCOPE_MODE || '').toLowerCase() === 'log') {
    console.warn(`[companyScope] would deny user ${req.auth.userId} (company ${mine}) on company ${companyId}`);
    return;
  }
  throw new ScopeError(403, 'Not allowed for this company');
}

function clearCompanyCache() {
  companyByUser.clear();
}

module.exports = { authenticateUser, assertCompanyAccess, callerCompanyId, callerSession, callerMembership, ScopeError, clearCompanyCache, registrationOrigin, bearerToken };
