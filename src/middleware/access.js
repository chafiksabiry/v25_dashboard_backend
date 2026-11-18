const mongoose = require('mongoose');
const { authenticateUser, assertCompanyAccess, callerCompanyId, callerMembership, bearerToken } = require('./companyScope');

/**
 * Contrôle d'accès des routes du tableau de bord (prospects, fichiers de contacts, Zoho, Vertex, Speech-to-Text, appels).
 *
 * Deux groupes de routes, comme le service des appels (v25_dash_calls_backend, middleware/callsAccess.js) :
 *
 *  - STRICT (`strictAuth`) : aucun appelant connu sans jeton. Jeton de connexion (JWT du service d'inscription) exigé, tant que
 *    DASHBOARD_REQUIRE_AUTH n'est pas explicitement `false` (retour de secours).
 *  - COMPATIBILITÉ (`compatAuth`) : des applications non migrées appellent encore sans jeton, ou avec l'ancien en-tête
 *    `Authorization: Bearer <gigId>:<userId>` (forgeable, ce n'est PAS une preuve d'identité). Avec un vrai jeton (JWT), le
 *    contrôle est complet : 401 si le jeton est invalide, 403 si la donnée appartient à une autre entreprise. Sans JWT, la requête
 *    est tolérée et journalisée tant que DASHBOARD_LEGACY_ANON n'est pas `false` (défaut : tolérée, pour ne pas casser la recette).
 *    À passer à `false` dès que les applications listées dans la PR envoient le jeton.
 *
 * Appartenance : l'entreprise d'un utilisateur est lue chez le service d'inscription (REGISTRATION_BACKEND_URL). Un rep (agent)
 * n'est pas membre de l'entreprise : il accède aux prospects d'un gig s'il y est inscrit (service de matching, MATCHING_API_URL).
 *
 * Agent CLOUD (agent / opérateur employé par le centre, `isAgent` dans /me) : membre de l'entreprise du gig, il travaille comme un rep
 * (liste des prospects, qualification, cockpit) mais ne gère pas les prospects (création, suppression, archivage, confirmation d'un
 * statut, champs autres que la disposition et le suivi).
 *
 * Identifiant d'acteur (agentId enregistré dans pendingDispositionBy, assignedRepId, cockpitLockedBy, et lu pour l'exclusivité) :
 * TOUJOURS déduit du jeton, jamais du client. Rep : `_id` de son profil rep (collection agents). Agent CLOUD sans profil rep :
 * son `userId`. Les deux espaces ne se recouvrent pas (identifiants Mongo distincts).
 */

const OBJECT_ID = /^[a-f0-9]{24}$/i;
const JWT_SHAPE = /^[\w-]+\.[\w-]+\.[\w-]+$/;
const ENROLL_TTL_MS = 60 * 1000;
const LOOKUP_TIMEOUT_MS = 4000;
const enrollCache = new Map();

function flag(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || String(raw).trim() === '') return fallback;
  return !/^(false|0|off|no)$/i.test(String(raw).trim());
}
const requireAuth = () => flag('DASHBOARD_REQUIRE_AUTH', true);
const legacyAnon = () => flag('DASHBOARD_LEGACY_ANON', true);
const hasJwt = (req) => JWT_SHAPE.test(bearerToken(req));

function deny(res, status, message) {
  return res.status(status).json({ success: false, message });
}

function sendScopeError(res, error) {
  if (error && error.status) return deny(res, error.status, error.message);
  console.error('[access]', error && error.message);
  return deny(res, 500, 'Access check failed');
}

/** Routes dont aucun appelant connu n'appelle sans jeton. */
function strictAuth(req, res, next) {
  if (!requireAuth()) {
    req.legacyAccess = true;
    return next();
  }
  return authenticateUser(req, res, next);
}

/** Routes encore appelées sans jeton (ou avec l'ancien en-tête gigId:userId). Vrai jeton présent = contrôle complet. */
function compatAuth(req, res, next) {
  if (hasJwt(req)) return authenticateUser(req, res, next);
  if (requireAuth() && !legacyAnon()) return deny(res, 401, 'Authentication required');
  req.legacyAccess = true;
  console.warn(`[dashboard-auth] requête sans jeton tolérée (compat) ${req.method} ${String(req.originalUrl || '').split('?')[0]}`);
  return next();
}

async function findRaw(collection, id, projection) {
  const raw = String(id || '');
  if (!raw) return null;
  const or = [{ _id: raw }];
  if (mongoose.Types.ObjectId.isValid(raw)) or.push({ _id: new mongoose.Types.ObjectId(raw) });
  return mongoose.connection.db.collection(collection).findOne({ $or: or }, { projection });
}
const idOf = (v) => (v ? String(v.$oid || v._id || v) : null);

function matchingOrigin() {
  const explicit = process.env.MATCHING_API_URL;
  const railway = process.env.RAILWAY_SERVICE_V25_MATCHING_BACKEND_URL;
  const raw = explicit || (railway ? (/^https?:\/\//i.test(railway) ? railway : `https://${railway}`) : '');
  const base = raw.replace(/\/+$/, '');
  return base && !/\/api$/.test(base) ? `${base}/api` : base;
}

/** Profil rep (agent) du porteur du jeton, null s'il n'en a pas. */
async function ownAgentId(req) {
  if (!req.auth) return null;
  if (req.auth.agentId !== undefined) return req.auth.agentId;
  const or = [{ userId: req.auth.userId }];
  if (mongoose.Types.ObjectId.isValid(req.auth.userId)) or.push({ userId: new mongoose.Types.ObjectId(req.auth.userId) });
  const agent = await mongoose.connection.db.collection('agents').findOne({ $or: or }, { projection: { _id: 1 } });
  req.auth.agentId = agent ? String(agent._id) : null;
  return req.auth.agentId;
}

/** Le rep est-il inscrit (statut enrolled) à ce gig ? */
async function agentEnrolledInGig(agentId, gigId) {
  const key = `${agentId}:${gigId}`;
  const cached = enrollCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.ok;
  const origin = matchingOrigin();
  if (!origin) {
    console.warn('[access] MATCHING_API_URL absent : un rep connecté est admis sur tout gig (inscription non vérifiable)');
    return true;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const res = await fetch(`${origin}/gig-agents/agents/${encodeURIComponent(agentId)}/gigs?status=enrolled`, { signal: controller.signal });
    if (!res.ok) throw Object.assign(new Error('Enrollment lookup failed'), { status: 503 });
    const payload = await res.json();
    const gigs = Array.isArray(payload && payload.gigs) ? payload.gigs : [];
    const ok = gigs.some((row) => String((row && row.gig && (row.gig._id || row.gig.$oid)) || (row && row.gigId) || '') === String(gigId));
    enrollCache.set(key, { ok, expires: Date.now() + ENROLL_TTL_MS });
    return ok;
  } catch (error) {
    if (error.status) throw error;
    throw Object.assign(new Error('Enrollment lookup failed'), { status: 503 });
  } finally {
    clearTimeout(timer);
  }
}

/** Agent / opérateur employé par le centre (CLOUD), d'après /me ; jamais vrai sans jeton. */
async function isCloudAgent(req) {
  if (!req.auth) return false;
  return (await callerMembership(req.auth)).isAgent === true;
}

/**
 * Niveau de l'appelant pour une entreprise :
 *  - 'member' : entreprise principale, appelant non agent (titulaire, membre) ;
 *  - 'agent'  : entreprise principale d'un agent CLOUD, OU tout autre centre atteint par companyIds / emploi actif (multi-centres :
 *    /me ne dit pas le rôle par entreprise, l'accès y est donc toujours de niveau agent) ;
 *  - null : aucune.
 */
async function companyLevel(req, companyId) {
  if (!req.auth || !companyId) return null;
  const session = await callerMembership(req.auth);
  const id = String(companyId);
  if (session.companyId && session.companyId === id) return session.isAgent ? 'agent' : 'member';
  if ((session.companyIds || []).includes(id)) return 'agent';
  if (String(process.env.COMPANY_SCOPE_MODE || '').toLowerCase() === 'log') return 'member';
  return null;
}

/**
 * Identifiant d'acteur du porteur du jeton, UNE seule règle partout (liste, qualification, cockpit) : profil rep d'abord, sinon
 * userId d'un appelant de niveau agent ; null sinon.
 */
async function actorId(req, { agentLevel }) {
  const agentId = await ownAgentId(req);
  if (agentId) return agentId;
  return agentLevel ? req.auth.userId : null;
}

/** Membre de l'entreprise (403 sinon). */
async function isMember(req, companyId) {
  if (!companyId) return false;
  try {
    await assertCompanyAccess(req, companyId);
    return true;
  } catch (error) {
    if (error && error.status === 403) return false;
    throw error;
  }
}

/**
 * Accès à un gig : membre de l'entreprise du gig, ou (si `allowReps`) rep inscrit au gig.
 * @returns {Promise<'ok'|'not_found'|'forbidden'>}
 */
async function gigAccess(req, gigId, { allowReps = true } = {}) {
  const gig = await findRaw('gigs', gigId, { companyId: 1 });
  if (!gig) return 'not_found';
  const level = await companyLevel(req, idOf(gig.companyId));
  if (level === 'member') return 'ok';
  // Niveau agent : il travaille les prospects du gig (lecture) mais ne les gère pas (création, archivage, fichiers).
  if (level === 'agent') return allowReps ? 'ok' : 'forbidden';
  if (allowReps) {
    const agentId = await ownAgentId(req);
    if (agentId && (await agentEnrolledInGig(agentId, idOf(gig._id)))) return 'ok';
  }
  return 'forbidden';
}

/** :companyId dans l'URL : l'appelant doit appartenir à cette entreprise. */
function guardCompanyParam(param = 'companyId', options = {}) {
  return async (req, res, next) => {
    if (!req.auth) return next();
    const companyId = req.params[param];
    if (!OBJECT_ID.test(String(companyId || ''))) return deny(res, 400, 'Valid companyId is required');
    try {
      await assertCompanyAccess(req, companyId);
      // Écrans de gestion (statistiques, couverture, compteurs) : pas pour un agent.
      if (options.membersOnly && (await isCloudAgent(req))) return deny(res, 403, 'Not allowed for an agent');
      return next();
    } catch (error) {
      return sendScopeError(res, error);
    }
  };
}

/** Gig désigné par l'URL ou le corps : membre de l'entreprise du gig, ou rep inscrit (si allowReps). */
function guardGig(pick, options = {}) {
  return async (req, res, next) => {
    if (!req.auth) return next();
    const gigIds = [].concat(pick(req) || []).map((g) => String(g || '').trim()).filter(Boolean);
    if (!gigIds.length) return options.required === false ? next() : deny(res, 400, 'gigId is required');
    try {
      for (const gigId of new Set(gigIds)) {
        const out = await gigAccess(req, gigId, options);
        if (out === 'not_found') return deny(res, 404, 'Gig not found');
        if (out === 'forbidden') return deny(res, 403, 'Not allowed for this gig');
      }
      return next();
    } catch (error) {
      return sendScopeError(res, error);
    }
  };
}

/**
 * Prospect :id. L'entreprise du prospect, celle de son gig et celle de l'appelant doivent être la même (un prospect dont l'entreprise
 * ne correspond pas à son gig est refusé). Niveaux : membre ; agent (CLOUD ou autre centre) : seulement un prospect qu'il voit dans sa
 * liste (non affecté à un autre) et jamais les actions de gestion ; rep inscrit au gig (si allowReps).
 */
function guardLeadParam(param = 'id', options = {}) {
  const allowReps = options.allowReps !== false;
  return async (req, res, next) => {
    if (!req.auth) return next();
    const leadId = req.params[param];
    if (!OBJECT_ID.test(String(leadId || ''))) return deny(res, 400, 'Valid lead id is required');
    try {
      const lead = await findRaw('leads', leadId, { companyId: 1, gigId: 1, assignedRepId: 1 });
      if (!lead) return deny(res, 404, 'Lead not found');
      const gig = lead.gigId ? await findRaw('gigs', idOf(lead.gigId), { companyId: 1 }) : null;
      if (lead.gigId && !gig) return deny(res, 403, 'Not allowed for this lead');
      const leadCompany = idOf(lead.companyId);
      const gigCompany = gig ? idOf(gig.companyId) : null;
      if (leadCompany && gigCompany && leadCompany !== gigCompany) return deny(res, 403, 'Not allowed for this lead');
      const company = gigCompany || leadCompany;
      const level = await companyLevel(req, company);
      if (level === 'member') {
        req.leadAccess = 'member';
        return next();
      }
      if (level === 'agent') {
        if (!allowReps || options.managersOnly || !gig) return deny(res, 403, 'Not allowed for an agent');
        const me = await actorId(req, { agentLevel: true });
        if (lead.assignedRepId && idOf(lead.assignedRepId) !== me) return deny(res, 403, 'Not allowed for this lead');
        req.leadAccess = 'agent';
        return next();
      }
      if (gig && allowReps && !options.managersOnly) {
        const agentId = await ownAgentId(req);
        if (agentId && (await agentEnrolledInGig(agentId, idOf(gig._id)))) {
          req.leadAccess = 'rep';
          return next();
        }
      }
      return deny(res, 403, 'Not allowed for this lead');
    } catch (error) {
      return sendScopeError(res, error);
    }
  };
}

/** :userId dans l'URL : uniquement le porteur du jeton. */
function guardSelfParam(param = 'userId') {
  return (req, res, next) => {
    if (!req.auth) return next();
    if (String(req.params[param] || '') !== req.auth.userId) return deny(res, 403, 'Not allowed for this user');
    return next();
  };
}

/** Listes globales (GET /leads, /leads/filter) : cantonnées à l'entreprise de l'appelant (req.scopeCompanyId). */
async function scopeToCallerCompany(req, res, next) {
  if (!req.auth) return next();
  try {
    const mine = await callerCompanyId(req.auth);
    if (!mine) return deny(res, 403, 'Not allowed for this company');
    req.scopeCompanyId = mine;
    return next();
  } catch (error) {
    return sendScopeError(res, error);
  }
}


/** Routes de gestion (listes globales des prospects, note qualité d'un appel) : refusées à un agent CLOUD. */
async function membersOnly(req, res, next) {
  if (!req.auth) return next();
  try {
    if (await isCloudAgent(req)) return deny(res, 403, 'Not allowed for an agent');
    return next();
  } catch (error) {
    return sendScopeError(res, error);
  }
}

/** Appel :id : membre de l'entreprise de l'appel, ou rep qui l'a passé. */
function guardCallParam(param = 'id') {
  return async (req, res, next) => {
    if (!req.auth) return next();
    const callId = req.params[param];
    if (!OBJECT_ID.test(String(callId || ''))) return deny(res, 400, 'Valid call id is required');
    try {
      const call = await findRaw('calls', callId, { companyId: 1, agent: 1 });
      if (!call) return deny(res, 404, 'Call not found');
      if (await isMember(req, idOf(call.companyId))) return next();
      const agentId = await ownAgentId(req);
      if (agentId && call.agent && idOf(call.agent) === agentId) return next();
      return deny(res, 403, 'Not allowed for this call');
    } catch (error) {
      return sendScopeError(res, error);
    }
  };
}

/**
 * Liste d'appels (GET /calls, /calls/gigs) : companyId de l'appelant, userId = lui-même, agentId = son profil rep.
 * Sans filtre, la liste est cantonnée à l'entreprise de l'appelant (ou à son profil rep).
 */
async function guardCallsQuery(req, res, next) {
  if (!req.auth) {
    const q = req.query || {};
    if (!['companyId', 'userId', 'agentId', 'leadId', 'gigId'].some((k) => q[k])) return deny(res, 401, 'Authentication required');
    return next();
  }
  const q = req.query || {};
  try {
    if (q.companyId) await assertCompanyAccess(req, q.companyId);
    if (q.userId && String(q.userId) !== req.auth.userId) return deny(res, 403, 'Not allowed for this user');
    if (q.agentId && String(q.agentId) !== String(await ownAgentId(req))) return deny(res, 403, 'Not allowed for this agent');
    if (!q.companyId && !q.userId && !q.agentId) {
      const mine = await callerCompanyId(req.auth);
      if (mine) req.query = { ...q, companyId: mine };
      else {
        const agentId = await ownAgentId(req);
        if (!agentId) return deny(res, 403, 'Not allowed for this company');
        req.query = { ...q, agentId };
      }
    }
    return next();
  } catch (error) {
    return sendScopeError(res, error);
  }
}

/**
 * Création de prospects (POST /leads, /leads/bulk) avec un jeton : l'entreprise de chaque prospect est celle de son gig
 * (déjà vérifié par guardGig) ; un companyId ou un userId envoyé par le client est remplacé.
 */
async function pinCreatedLeadsCompany(req, res, next) {
  if (!req.auth) return next();
  try {
    const companyOf = {};
    const resolve = async (gigId) => {
      const key = String(gigId);
      if (!(key in companyOf)) {
        const gig = await findRaw('gigs', key, { companyId: 1 });
        companyOf[key] = gig ? idOf(gig.companyId) : null;
      }
      return companyOf[key];
    };
    const body = req.body || {};
    if (Array.isArray(body.leads)) {
      for (const lead of body.leads) {
        const gigId = (lead && lead.gigId) || body.gigId;
        const companyId = gigId ? await resolve(gigId) : null;
        if (!companyId) return deny(res, 400, 'Each lead needs a gig of your company');
        lead.gigId = gigId;
        lead.companyId = companyId;
        lead.userId = req.auth.userId;
      }
    } else {
      const companyId = body.gigId ? await resolve(body.gigId) : null;
      if (!companyId) return deny(res, 400, 'gigId is required');
      body.companyId = companyId;
      body.userId = req.auth.userId;
    }
    return next();
  } catch (error) {
    return sendScopeError(res, error);
  }
}

// Champs qu'un rep ou un agent peut modifier par PUT /leads/:id : la date de rappel seulement. La qualification passe UNIQUEMENT par
// PUT /:id/disposition (statut en attente de confirmation de l'entreprise) : Stage, repDisposition, pendingDisposition, followUpCalls
// (récompenses), etc. sont refusés.
const FOLLOW_UP_TYPES = new Set(['appointment', 'callback']);
const MAX_FOLLOW_UP_MS = 90 * 24 * 60 * 60 * 1000;
function followUpPatch(body) {
  const keys = Object.keys(body);
  const forbidden = keys.filter((k) => !['nextFollowUpAt', 'nextFollowUpType', 'nextFollowUpSource'].includes(k));
  if (forbidden.length) return { error: `Fields not editable: ${forbidden.join(', ')}` };
  const out = {};
  if ('nextFollowUpAt' in body) {
    if (body.nextFollowUpAt === null) out.nextFollowUpAt = null;
    else {
      const t = typeof body.nextFollowUpAt === 'string' ? Date.parse(body.nextFollowUpAt) : NaN;
      if (!Number.isFinite(t) || t > Date.now() + MAX_FOLLOW_UP_MS) return { error: 'Invalid nextFollowUpAt' };
      out.nextFollowUpAt = new Date(t);
    }
  }
  if ('nextFollowUpType' in body) {
    if (body.nextFollowUpType !== null && !FOLLOW_UP_TYPES.has(body.nextFollowUpType)) return { error: 'Invalid nextFollowUpType' };
    out.nextFollowUpType = body.nextFollowUpType;
  }
  if ('nextFollowUpSource' in body) {
    if (body.nextFollowUpSource !== null && body.nextFollowUpSource !== 'rep') return { error: 'Invalid nextFollowUpSource' };
    out.nextFollowUpSource = body.nextFollowUpSource;
  }
  if (!Object.keys(out).length) return { error: 'Nothing to update' };
  return { value: out };
}

/**
 * Modification d'un prospect (PUT /leads/:id, après guardLeadParam) avec un jeton :
 *  - membre : companyId et userId ne sont pas modifiables ; un nouveau gigId doit appartenir à son entreprise (companyId suivi) ;
 *  - rep ou agent : la date de rappel seulement, valeurs validées (date, type, source « rep ») ; 403 / 400 sinon.
 */
async function guardLeadUpdate(req, res, next) {
  if (!req.auth) return next();
  const body = req.body || {};
  if (req.leadAccess === 'rep' || req.leadAccess === 'agent') {
    const checked = followUpPatch(body);
    if (checked.error) return deny(res, checked.error.startsWith('Fields') ? 403 : 400, checked.error);
    req.body = checked.value;
    return next();
  }
  try {
    delete body.companyId;
    delete body.userId;
    if (body.gigId) {
      const gig = await findRaw('gigs', body.gigId, { companyId: 1 });
      if (!gig) return deny(res, 404, 'Gig not found');
      if (!(await isMember(req, idOf(gig.companyId)))) return deny(res, 403, 'Not allowed for this gig');
      body.companyId = idOf(gig.companyId);
    }
    return next();
  } catch (error) {
    return sendScopeError(res, error);
  }
}

/** Actions de rep (disposition, cockpit) avec un jeton : agentId pris dans le profil rep du porteur, jamais dans le corps. */
async function pinAgentFromToken(req, res, next) {
  if (!req.auth) return next();
  try {
    const agentId = await actorId(req, { agentLevel: req.leadAccess === 'agent' });
    if (!agentId) return deny(res, 403, 'A rep profile is required');
    req.body = { ...(req.body || {}), agentId };
    return next();
  } catch (error) {
    return sendScopeError(res, error);
  }
}

/**
 * Liste des prospects d'un gig (GET /gig/:gigId, /search, après guardGig) avec un jeton : un rep ou un agent CLOUD voit la liste
 * filtrée pour SON identifiant d'acteur (exclusivité, « déjà appelé ») ; l'agentId de la requête est remplacé. Un gestionnaire
 * (membre non agent) garde la liste de l'entreprise (agentId de la requête retiré).
 */
async function pinListAgent(req, res, next) {
  if (!req.auth) return next();
  try {
    const gig = await findRaw('gigs', req.params.gigId, { companyId: 1 });
    const level = gig ? await companyLevel(req, idOf(gig.companyId)) : null;
    const q = { ...(req.query || {}) };
    delete q.agentId;
    // Même règle que la qualification (actorId) : profil rep d'abord, sinon userId au niveau agent ; gestionnaire : liste complète.
    const agentId = level === 'member' ? null : await actorId(req, { agentLevel: level === 'agent' });
    if (agentId) q.agentId = agentId;
    req.query = q;
    return next();
  } catch (error) {
    return sendScopeError(res, error);
  }
}

function clearEnrollCache() {
  enrollCache.clear();
}

module.exports = {
  strictAuth,
  compatAuth,
  guardCompanyParam,
  guardGig,
  guardLeadParam,
  guardSelfParam,
  scopeToCallerCompany,
  guardCallParam,
  pinCreatedLeadsCompany,
  guardLeadUpdate,
  pinAgentFromToken,
  pinListAgent,
  membersOnly,
  guardCallsQuery,
  requireAuth,
  legacyAnon,
  clearEnrollCache,
};
