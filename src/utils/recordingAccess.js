/**
 * Écoute des enregistrements d'appels (décision du 18/11/2026), même règle que le service des appels
 * (v25_dash_calls_backend, src/utils/recordingAccess.js) : `recording_url` et `recording_url_cloudinary` ne sont renvoyés
 * qu'à une session `isOwner === true` (hors agent et hors contact client) ou à une personne dont les droits contiennent
 * `calls.listen === true`. Tous les autres reçoivent null ; le reste de l'appel est inchangé.
 *
 * Fermé par défaut : sans jeton (appelant toléré en compatibilité), session illisible ou service d'inscription indisponible,
 * les URL sont retirées.
 *
 * Source : `GET /api/company-members/me` (service d'inscription), lu via companyScope.callerSession (même cache court que le
 * contrôle d'entreprise). Réserve : /me renvoie aussi `isOwner: true` et tous les droits pour un compte sans CompanyMembership
 * ni entreprise possédée (reps freelances, anciens comptes, `companyId: null`). Ce filtre ne leur ouvre rien par lui-même :
 * les gardes de middleware/access.js les limitent à leurs propres appels (agentId / userId = les leurs).
 */
const { callerSession } = require('../middleware/companyScope');

const RECORDING_FIELDS = ['recording_url', 'recording_url_cloudinary'];

function canListenRecordings(session) {
  if (!session || typeof session !== 'object') return false;
  const provenOwner = session.isOwner === true && session.isAgent !== true && session.isClient !== true;
  const listen = Boolean(session.permissions && session.permissions['calls.listen'] === true);
  return provenOwner || listen;
}

/** Droit d'écoute de l'appelant (mémorisé sur la requête). Ne lève jamais : en cas de doute, false. */
async function callerCanListen(req) {
  if (!req) return false;
  if (typeof req.canListenRecordings === 'boolean') return req.canListenRecordings;
  let allowed = false;
  if (req.auth) {
    try {
      allowed = canListenRecordings(await callerSession(req.auth));
    } catch (error) {
      console.warn(`[recording-access] droits illisibles pour ${req.auth.userId} : enregistrements masqués (${error && error.message})`);
    }
  }
  req.canListenRecordings = allowed;
  return allowed;
}

function stripRecording(call) {
  if (!call || typeof call !== 'object') return call;
  const plain = typeof call.toJSON === 'function' ? call.toJSON() : { ...call };
  for (const field of RECORDING_FIELDS) plain[field] = null;
  return plain;
}

/** Entreprise principale de l'appelant (null si inconnue). Mémorisée sur la requête. */
async function callerPrimaryCompany(req) {
  if (!req || !req.auth) return null;
  if (req.listenCompanyId !== undefined) return req.listenCompanyId;
  try { req.listenCompanyId = (await callerSession(req.auth)).companyId || null; } catch { req.listenCompanyId = null; }
  return req.listenCompanyId;
}

const idOfRef = (v) => (v ? String((v && (v._id || v.$oid)) || v) : null);

/** Profil rep de l'appelant (même lecture que middleware/access.js), mémorisé sur la requête ; null sinon. */
async function callerAgentId(req) {
  if (!req || !req.auth) return null;
  if (req.recordingAgentId !== undefined) return req.recordingAgentId;
  try {
    const { ownAgentId } = require('../middleware/access');
    req.recordingAgentId = (await ownAgentId(req)) || null;
  } catch { req.recordingAgentId = null; }
  return req.recordingAgentId;
}

const companyOfCall = (call) => {
  const c = call && (call.companyId && (call.companyId._id || call.companyId));
  return c ? String(c) : null;
};

/**
 * Appel(s) tel(s) que l'appelant a le droit de les voir. `isOwner` et `calls.listen` sont globaux dans /me et ne valent que pour
 * l'entreprise PRINCIPALE : l'appel d'une autre entreprise (atteinte par un agent multi-centres via companyIds / emploi) n'expose
 * jamais son enregistrement.
 */
async function applyRecordingAccess(req, data) {
  if (!(await callerCanListen(req))) return Array.isArray(data) ? data.map(stripRecording) : stripRecording(data);
  const primary = await callerPrimaryCompany(req);
  const mine = await callerAgentId(req);
  const one = (call) => {
    const company = companyOfCall(call);
    if (company) return company !== primary ? stripRecording(call) : call;
    // Appel sans entreprise : seulement l'appelant qui l'a passé (rep indépendant sur ses propres appels).
    const agent = idOfRef(call && call.agent);
    const user = idOfRef(call && call.userId);
    const own = (mine && agent === mine) || (req.auth && user === req.auth.userId);
    return own ? call : stripRecording(call);
  };
  return Array.isArray(data) ? data.map(one) : one(data);
}

module.exports = { canListenRecordings, callerCanListen, stripRecording, applyRecordingAccess, RECORDING_FIELDS };
