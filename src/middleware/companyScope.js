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
 * Appartenance de l'appelant, lue chez le service d'inscription (`GET /api/company-members/me`) :
 *  - `companyId` : entreprise principale (ou active) ;
 *  - `companyIds` : toutes les entreprises dont il est membre : principale, `companyIds`, et emplois actifs d'un agent qui travaille
 *    pour plusieurs centres (`employments[].status === 'active'`) ;
 *  - `isAgent` : agent / opérateur employé par le centre (CLOUD), `isOwner` : titulaire.
 */
async function callerMembership(auth) {
  const cached = companyByUser.get(auth.userId);
  if (cached && cached.expires > Date.now()) return cached.membership;

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
    const d = (payload && payload.data) || {};
    const companyId = d.companyId ? String(d.companyId) : null;
    const activeEmployments = (Array.isArray(d.employments) ? d.employments : []).filter((e) => e && (!e.status || e.status === 'active'));
    const companyIds = [...new Set([companyId, ...idList(d.companyIds), ...idList(activeEmployments)].filter(Boolean))];
    const membership = { companyId, companyIds, isAgent: d.isAgent === true, isOwner: d.isOwner === true };
    companyByUser.set(auth.userId, { membership, expires: Date.now() + CACHE_TTL_MS });
    return membership;
  } catch (error) {
    if (error instanceof ScopeError) throw error;
    throw new ScopeError(503, 'Company lookup failed');
  } finally {
    clearTimeout(timer);
  }
}

async function callerCompanyId(auth) {
  return (await callerMembership(auth)).companyId;
}

/** Throws a ScopeError unless the authenticated caller belongs to `companyId` (principale ou emploi actif). */
async function assertCompanyAccess(req, companyId) {
  if (!req.auth) throw new ScopeError(401, 'Authentication required');
  const { companyId: mine, companyIds } = await callerMembership(req.auth);
  if (companyId && companyIds.includes(String(companyId))) return;
  if (String(process.env.COMPANY_SCOPE_MODE || '').toLowerCase() === 'log') {
    console.warn(`[companyScope] would deny user ${req.auth.userId} (company ${mine}) on company ${companyId}`);
    return;
  }
  throw new ScopeError(403, 'Not allowed for this company');
}

function clearCompanyCache() {
  companyByUser.clear();
}

module.exports = { authenticateUser, assertCompanyAccess, callerCompanyId, callerMembership, ScopeError, clearCompanyCache, registrationOrigin, bearerToken };
