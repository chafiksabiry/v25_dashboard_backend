process.env.JWT_SECRET = 'test-secret';
process.env.REGISTRATION_BACKEND_URL = 'https://reg.example';
process.env.MATCHING_API_URL = 'https://match.example/api';

const echo = () => new Proxy({}, { get: (_t, name) => (typeof name === 'string' && name !== 'then' && name !== '__esModule' ? (req, res) => res.status(200).json({ success: true, handler: name, query: req.query, body: req.body, scope: req.scopeCompanyId || null }) : undefined) });
jest.mock('../controllers/leads', () => echo());
jest.mock('../controllers/calls', () => echo());
jest.mock('../controllers/vertex', () => echo());
jest.mock('../controllers/speech-to-text', () => echo());
jest.mock('../controllers/zoho', () => echo());
jest.mock('../services/zoho.service', () => ({}));
jest.mock('../models/ZohoConfig', () => ({ findOne: async () => null }));
jest.mock('../middleware/zohoTokenMiddleware', () => ({ zohoTokenMiddleware: (_q, _s, n) => n(), requireZohoConfig: (_q, _s, n) => n() }));

const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');

const A = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const B = 'bbbbbbbbbbbbbbbbbbbbbbb2';
const GIG_A = '6a0000000000000000000a01';
const GIG_B = '6a0000000000000000000b02';
const LEAD_A = '6b0000000000000000000a01';
const LEAD_B = '6b0000000000000000000b02';
const LEAD_A_TAKEN = '6b0000000000000000000a03';
const LEAD_MISMATCH = '6b0000000000000000000a04';
const CALL_B = '6c0000000000000000000b02';
const CALL_A = '6c0000000000000000000a01';
const CALL_REP = '6c0000000000000000000a02';
const U_REP = '6d00000000000000000000e1';
const AGENT_REP = '6e00000000000000000000e1';
const token = (userId) => jwt.sign({ userId }, 'test-secret');
const members = { 'u-a': { companyId: A }, 'u-b': { companyId: B }, 'u-ag': { companyId: A, isAgent: true }, 'u-agb': { companyId: B, isAgent: true }, 'u-multi': { companyId: B, isAgent: false, isOwner: true, permissions: { 'calls.listen': true }, employments: [{ companyId: A, status: 'active' }, { companyId: 'ccccccccccccccccccccccc3', status: 'revoked' }] }, 'u-nostatus': { companyId: B, isAgent: true, employments: [{ companyId: A }] } };

const db = {
  gigs: { [GIG_A]: { _id: GIG_A, companyId: A }, [GIG_B]: { _id: GIG_B, companyId: B } },
  leads: { [LEAD_A]: { _id: LEAD_A, companyId: A, gigId: GIG_A }, [LEAD_B]: { _id: LEAD_B, gigId: GIG_B }, [LEAD_A_TAKEN]: { _id: LEAD_A_TAKEN, companyId: A, gigId: GIG_A, assignedRepId: '6e00000000000000000000ff' }, [LEAD_MISMATCH]: { _id: LEAD_MISMATCH, companyId: B, gigId: GIG_A } },
  calls: { [CALL_B]: { _id: CALL_B, companyId: B }, [CALL_A]: { _id: CALL_A, companyId: A }, [CALL_REP]: { _id: CALL_REP, companyId: A, agent: AGENT_REP } },
};
const fakeDb = (m) => Object.defineProperty(m.connection, 'db', {
  configurable: true,
  get: () => ({
    collection: (name) => ({
      findOne: async (q) => {
        if (name === 'agents') return q.$or.some((o) => String(o.userId) === U_REP) ? { _id: AGENT_REP } : null;
        return (db[name] || {})[String(q.$or[0]._id)] || null;
      },
    }),
  }),
});

let server; let port; let realFetch;
const build = () => {
  jest.resetModules();
  fakeDb(require('mongoose'));
  const app = express();
  app.use(express.json());
  app.use('/api/leads', require('../routes/leads'));
  app.use('/api/calls', require('../routes/calls'));
  app.use('/api/vertex', require('../routes/vertex'));
  app.use('/api/speechToText', require('../routes/speech-to-text'));
  app.use('/api/zoho', require('../routes/zoho'));
  app.use('/api/file-processing', require('../routes/file-processing'));
  return app;
};
const call = (method, path, { auth, body, headers = {} } = {}) => new Promise((resolve, reject) => {
  const data = body ? JSON.stringify(body) : null;
  const req = http.request({ host: '127.0.0.1', port, method, path, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...headers } }, (res) => {
    let out = ''; res.on('data', (c) => { out += c; });
    res.on('end', () => { let parsed = null; try { parsed = out ? JSON.parse(out) : null; } catch { parsed = out; } resolve({ status: res.statusCode, body: parsed }); });
  });
  req.on('error', reject);
  if (data) req.write(data);
  req.end();
});

beforeAll(() => { realFetch = global.fetch; });
beforeEach(async () => {
  ['DASHBOARD_REQUIRE_AUTH', 'DASHBOARD_LEGACY_ANON', 'COMPANY_SCOPE_MODE'].forEach((k) => delete process.env[k]);
  const app = build();
  await new Promise((r) => { server = app.listen(0, '127.0.0.1', r); });
  port = server.address().port;
  global.fetch = jest.fn(async (url) => {
    const u = new URL(url);
    if (u.host === 'match.example') {
      const enrolled = u.pathname.includes(AGENT_REP) ? [{ gig: { _id: GIG_A } }] : [];
      return { ok: true, json: async () => ({ gigs: enrolled }) };
    }
    const userId = u.searchParams.get('userId');
    return { ok: true, json: async () => ({ success: true, data: members[userId] || { companyId: null } }) };
  });
});
afterEach(async () => { await new Promise((r) => server.close(r)); global.fetch = realFetch; });

describe('routes strictes : jeton exigé (401)', () => {
  const routes = [
    ['GET', '/api/leads'], ['GET', '/api/leads/filter?pipeline=p&stage=s'], ['POST', '/api/leads/upload-csv'],
    ['POST', '/api/vertex/call/score'], ['POST', '/api/vertex/audio/summarize'], ['POST', '/api/speechToText/transcribe'],
    ['GET', '/api/zoho/configs'], ['GET', `/api/zoho/config/${GIG_A}`],
  ];
  test.each(routes)('%s %s sans jeton : 401', async (method, path) => {
    expect((await call(method, path)).status).toBe(401);
  });
  test.each(routes)('%s %s ancien en-tête gigId:userId : 401', async (method, path) => {
    expect((await call(method, path, { auth: `${GIG_A}:u-a` })).status).toBe(401);
  });
  test.each(routes)('%s %s jeton signé avec your-secret-key : 401', async (method, path) => {
    expect((await call(method, path, { auth: jwt.sign({ userId: 'u-a' }, 'your-secret-key') })).status).toBe(401);
  });
  test('GET /api/leads avec jeton : cantonné à l\'entreprise de l\'appelant', async () => {
    const r = await call('GET', '/api/leads', { auth: token('u-a') });
    expect(r.status).toBe(200);
    expect(r.body.scope).toBe(A);
  });
  test('vertex avec jeton : 200', async () => {
    expect((await call('POST', '/api/vertex/call/score', { auth: token('u-a'), body: {} })).status).toBe(200);
  });
});

describe('routes compat : contrôle complet avec un jeton', () => {
  test('statistiques d\'une autre entreprise : 403 ; la sienne : 200', async () => {
    expect((await call('GET', `/api/leads/company/${B}/stats`, { auth: token('u-a') })).status).toBe(403);
    expect((await call('GET', `/api/leads/company/${A}/stats`, { auth: token('u-a') })).status).toBe(200);
  });
  test('prospect d\'une autre entreprise : 403 (lecture, modification, suppression)', async () => {
    expect((await call('GET', `/api/leads/${LEAD_B}`, { auth: token('u-a') })).status).toBe(403);
    expect((await call('PUT', `/api/leads/${LEAD_B}`, { auth: token('u-a'), body: {} })).status).toBe(403);
    expect((await call('DELETE', `/api/leads/${LEAD_B}`, { auth: token('u-a') })).status).toBe(403);
    expect((await call('GET', `/api/leads/${LEAD_A}`, { auth: token('u-a') })).status).toBe(200);
  });
  test('prospects d\'un gig d\'une autre entreprise : 403', async () => {
    expect((await call('GET', `/api/leads/gig/${GIG_B}`, { auth: token('u-a') })).status).toBe(403);
    expect((await call('POST', '/api/leads/bulk', { auth: token('u-a'), body: { gigId: GIG_A, leads: [{ gigId: GIG_B }] } })).status).toBe(403);
    expect((await call('POST', '/api/leads/archive', { auth: token('u-a'), body: { gigId: GIG_B, all: true } })).status).toBe(403);
    expect((await call('GET', `/api/file-processing/mapping/${GIG_B}`, { auth: token('u-a') })).status).toBe(403);
  });
  test('rep inscrit au gig : accès aux prospects du gig, pas à ceux d\'un autre gig ni à la suppression', async () => {
    expect((await call('GET', `/api/leads/gig/${GIG_A}`, { auth: token(U_REP) })).status).toBe(200);
    expect((await call('PUT', `/api/leads/${LEAD_A}/disposition`, { auth: token(U_REP), body: {} })).status).toBe(200);
    expect((await call('GET', `/api/leads/gig/${GIG_B}`, { auth: token(U_REP) })).status).toBe(403);
    expect((await call('DELETE', `/api/leads/${LEAD_A}`, { auth: token(U_REP) })).status).toBe(403);
  });
  test('jeton invalide : 401', async () => {
    expect((await call('GET', `/api/leads/company/${A}/stats`, { auth: 'a.b.c' })).status).toBe(401);
  });
  test('configuration Zoho d\'un autre utilisateur : 403', async () => {
    expect((await call('GET', '/api/zoho/config/user/u-b', { auth: token('u-a') })).status).toBe(403);
  });
  test('appel d\'une autre entreprise : 403 ; liste d\'une autre entreprise : 403', async () => {
    expect((await call('GET', `/api/calls/${CALL_B}`, { auth: token('u-a') })).status).toBe(403);
    expect((await call('GET', `/api/calls?companyId=${B}`, { auth: token('u-a') })).status).toBe(403);
    const mine = await call('GET', '/api/calls', { auth: token('u-a') });
    expect(mine.status).toBe(200);
    expect(mine.body.query.companyId).toBe(A);
  });
});


describe('écritures de prospects avec un jeton', () => {
  test('création : companyId et userId imposés depuis le gig et le jeton', async () => {
    const r = await call('POST', '/api/leads', { auth: token('u-a'), body: { gigId: GIG_A, companyId: B, userId: 'pirate' } });
    expect(r.status).toBe(200);
    expect(r.body.body.companyId).toBe(A);
    expect(r.body.body.userId).toBe('u-a');
    expect((await call('POST', '/api/leads', { auth: token('u-a'), body: { gigId: GIG_B } })).status).toBe(403);
  });
  test('import en masse : entreprise de chaque prospect imposée', async () => {
    const r = await call('POST', '/api/leads/bulk', { auth: token('u-a'), body: { gigId: GIG_A, leads: [{ First_Name: 'x', companyId: B }] } });
    expect(r.status).toBe(200);
    expect(r.body.body.leads[0].companyId).toBe(A);
    expect(r.body.body.leads[0].gigId).toBe(GIG_A);
  });
  test('modification par un membre : companyId ignoré, gig d\'une autre entreprise refusé', async () => {
    const r = await call('PUT', `/api/leads/${LEAD_A}`, { auth: token('u-a'), body: { First_Name: 'y', companyId: B } });
    expect(r.status).toBe(200);
    expect(r.body.body.companyId).toBeUndefined();
    expect((await call('PUT', `/api/leads/${LEAD_A}`, { auth: token('u-a'), body: { gigId: GIG_B } })).status).toBe(403);
  });
  test('modification par un rep : la date de rappel seulement ; la qualification passe par /disposition', async () => {
    const ok = await call('PUT', `/api/leads/${LEAD_A}`, { auth: token(U_REP), body: { nextFollowUpAt: '2026-12-01T17:00:00Z', nextFollowUpType: 'callback', nextFollowUpSource: 'rep' } });
    expect(ok.status).toBe(200);
    expect(Object.keys(ok.body.body).sort()).toEqual(['nextFollowUpAt', 'nextFollowUpSource', 'nextFollowUpType']);
    for (const body of [{ repDisposition: 'argued_done' }, { pendingDisposition: 'argued_done' }, { Stage: 'Won' }, { followUpCalls: [{ rewardAmount: 100, repId: 'x' }] }, { Phone: '+33600000000' }, { nextFollowUpAt: '2026-12-01T17:00:00Z', repDisposition: 'argued_done' }]) {
      expect((await call('PUT', `/api/leads/${LEAD_A}`, { auth: token(U_REP), body })).status).toBe(403);
    }
    for (const body of [{ nextFollowUpAt: 'demain' }, { nextFollowUpAt: '2099-01-01T00:00:00Z' }, { nextFollowUpType: 'transaction' }, { nextFollowUpSource: 'ai' }, { nextFollowUpAt: { $gt: '' } }, {}]) {
      expect((await call('PUT', `/api/leads/${LEAD_A}`, { auth: token(U_REP), body })).status).toBe(400);
    }
  });
  test('disposition et cockpit : agentId pris dans le jeton', async () => {
    const r = await call('PUT', `/api/leads/${LEAD_A}/disposition`, { auth: token(U_REP), body: { agentId: 'autre', disposition: 'x' } });
    expect(r.status).toBe(200);
    expect(r.body.body.agentId).toBe(AGENT_REP);
    const c = await call('POST', `/api/leads/${LEAD_A}/cockpit-claim`, { auth: token(U_REP), body: { agentId: 'autre' } });
    expect(c.body.body.agentId).toBe(AGENT_REP);
    expect((await call('PUT', `/api/leads/${LEAD_A}/disposition`, { auth: token('u-a'), body: { agentId: 'x' } })).status).toBe(403);
  });
});

describe('routes compat : applications non migrées', () => {
  test('sans jeton (ou ancien en-tête gigId:userId) : toléré par défaut', async () => {
    expect((await call('GET', `/api/leads/company/${B}/stats`)).status).toBe(200);
    expect((await call('GET', `/api/leads/gig/${GIG_B}`, { auth: `${GIG_B}:u-a` })).status).toBe(200);
  });
  test('DASHBOARD_LEGACY_ANON=false : 401 sans jeton', async () => {
    process.env.DASHBOARD_LEGACY_ANON = 'false';
    expect((await call('GET', `/api/leads/company/${A}/stats`)).status).toBe(401);
    expect((await call('GET', `/api/leads/gig/${GIG_A}`, { auth: `${GIG_A}:u-a` })).status).toBe(401);
    expect((await call('GET', `/api/file-processing/visibility/${GIG_A}`)).status).toBe(401);
  });
  test('liste d\'appels sans jeton ni filtre : 401 (pas de vidage global)', async () => {
    expect((await call('GET', '/api/calls')).status).toBe(401);
  });
});

describe('configuration et identifiants Google', () => {
  test('JWT_SECRET requis au démarrage, aucune valeur par défaut', () => {
    const { missingRequiredEnv } = require('../config/env');
    expect(missingRequiredEnv({})).toEqual(['JWT_SECRET']);
    const src = require('fs').readFileSync(require('path').join(__dirname, '../config/env.js'), 'utf8');
    expect(src).not.toMatch(/your-secret-key/);
  });
  test('Vertex : modèle par défaut gemini-3.1-flash-lite en eu, gemini-1.5 remplacé', () => {
    const silent = { warn: jest.fn(), error: jest.fn() };
    const vertex = require('../services/vertex');
    const { model, options } = vertex.vertexClientOptions({}, silent);
    expect(model).toBe('gemini-3.1-flash-lite');
    expect(options.location).toBe('eu');
    expect(options.apiEndpoint).toBe('aiplatform.eu.rep.googleapis.com');
    expect(vertex.resolveVertexModel({ VERTEX_AI_MODEL: 'gemini-1.5-flash-002' }, silent)).toBe('gemini-3.1-flash-lite');
  });
  test('Vertex : VERTEX_AI_CREDENTIALS JSON (\\n corrigés) passé au client, projet du compte de service', () => {
    const silent = { warn: jest.fn(), error: jest.fn() };
    const sa = { project_id: 'p1', client_email: 'x@p1.iam.gserviceaccount.com', private_key: 'a\\nb' };
    const { options } = require('../services/vertex').vertexClientOptions({ VERTEX_AI_CREDENTIALS: JSON.stringify(sa) }, silent);
    expect(options.googleAuthOptions.credentials.private_key).toBe('a\nb');
    expect(options.project).toBe('p1');
  });
  test('sans variable : message clair, aucune exception au chargement', () => {
    const logger = { warn: jest.fn(), error: jest.fn() };
    const { options, configError } = require('../services/vertex').vertexClientOptions({}, logger);
    expect(options.googleAuthOptions.credentials).toBeUndefined();
    expect(configError && configError.statusCode).toBe(503);
    expect(logger.warn.mock.calls.some((c) => /VERTEX_AI_CREDENTIALS/.test(c[0]))).toBe(true);
  });
  test('aucun fichier de clé dans le dépôt', () => {
    const fs = require('fs'); const path = require('path');
    expect(fs.existsSync(path.join(__dirname, '../config/vertexServiceAccount.json'))).toBe(false);
    expect(fs.existsSync(path.join(__dirname, '../config/speechToTextServiceAccount.json'))).toBe(false);
  });
});

describe('agent CLOUD (agent / opérateur du centre, isAgent dans /me) : liste et qualifie, ne gère pas', () => {
  const AG = 'u-ag';
  test('liste des prospects du gig : agentId imposé depuis le jeton (userId), jamais celui du client', async () => {
    const r = await call('GET', `/api/leads/gig/${GIG_A}?agentId=${AGENT_REP}&page=1`, { auth: token(AG) });
    expect(r.status).toBe(200);
    expect(r.body.query).toMatchObject({ agentId: AG, page: '1' });
    const s2 = await call('GET', `/api/leads/gig/${GIG_A}/search?search=x&agentId=forge`, { auth: token(AG) });
    expect(s2.body.query.agentId).toBe(AG);
  });
  test('gestionnaire : liste de l\'entreprise (agentId retiré) ; rep : son profil rep', async () => {
    expect((await call('GET', `/api/leads/gig/${GIG_A}?agentId=forge`, { auth: token('u-a') })).body.query.agentId).toBeUndefined();
    expect((await call('GET', `/api/leads/gig/${GIG_A}?agentId=forge`, { auth: token(U_REP) })).body.query.agentId).toBe(AGENT_REP);
  });
  test('gig d\'une autre entreprise : 403', async () => {
    expect((await call('GET', `/api/leads/gig/${GIG_B}`, { auth: token(AG) })).status).toBe(403);
  });
  test('qualification : 200, agentId = userId du jeton ; un membre non agent sans profil rep reste refusé', async () => {
    const r = await call('PUT', `/api/leads/${LEAD_A}/disposition`, { auth: token(AG), body: { agentId: AGENT_REP, disposition: 'called_callback' } });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ handler: 'setDisposition', body: { agentId: AG, disposition: 'called_callback' } });
    expect((await call('PUT', `/api/leads/${LEAD_A}/disposition`, { auth: token('u-a'), body: { disposition: 'to_call' } })).status).toBe(403);
    expect((await call('POST', `/api/leads/${LEAD_A}/cockpit-claim`, { auth: token(AG), body: {} })).body.body.agentId).toBe(AG);
  });
  test('actions de gestion refusées : confirmer un statut, supprimer, archiver, créer, champs hors disposition', async () => {
    expect((await call('PUT', `/api/leads/${LEAD_A}/disposition/confirm`, { auth: token(AG), body: { approve: true } })).status).toBe(403);
    expect((await call('PUT', `/api/leads/${LEAD_A}/disposition/confirm`, { auth: token('u-a'), body: { approve: true } })).status).toBe(200);
    expect((await call('DELETE', `/api/leads/${LEAD_A}`, { auth: token(AG) })).status).toBe(403);
    expect((await call('POST', `/api/leads/${LEAD_A}/archive`, { auth: token(AG) })).status).toBe(403);
    expect((await call('POST', '/api/leads', { auth: token(AG), body: { gigId: GIG_A, Deal_Name: 'x' } })).status).toBe(403);
    expect((await call('PUT', `/api/leads/${LEAD_A}`, { auth: token(AG), body: { Deal_Name: 'x' } })).status).toBe(403);
    expect((await call('PUT', `/api/leads/${LEAD_A}`, { auth: token(AG), body: { repDisposition: 'argued_done' } })).status).toBe(403);
    expect((await call('PUT', `/api/leads/${LEAD_A}`, { auth: token(AG), body: { nextFollowUpAt: '2026-12-01T17:00:00Z' } })).status).toBe(200);
  });
  test('multi-centres : un emploi actif ne donne qu\'un accès agent à l\'autre centre', async () => {
    expect((await call('PUT', `/api/leads/${LEAD_A}/disposition`, { auth: token('u-multi'), body: { disposition: 'to_call' } })).status).toBe(200);
    expect((await call('GET', `/api/leads/gig/${GIG_A}`, { auth: token('u-multi') })).body.query.agentId).toBe('u-multi');
    expect((await call('PUT', `/api/leads/${LEAD_A}`, { auth: token('u-multi'), body: { nextFollowUpAt: '2026-12-01T17:00:00Z' } })).status).toBe(200);
    // pas d'accès membre : statistiques, couverture, compteurs, fichiers, gestion
    expect((await call('GET', `/api/leads/company/${A}/stats`, { auth: token('u-multi') })).status).toBe(403);
    expect((await call('GET', `/api/leads/company/${A}/has-leads`, { auth: token('u-multi') })).status).toBe(403);
    expect((await call('GET', `/api/file-processing/mapping/${GIG_A}`, { auth: token('u-multi') })).status).toBe(403);
    expect((await call('POST', '/api/leads', { auth: token('u-multi'), body: { gigId: GIG_A } })).status).toBe(403);
    expect((await call('PUT', `/api/leads/${LEAD_A}/disposition/confirm`, { auth: token('u-multi'), body: { approve: true } })).status).toBe(403);
    expect((await call('PUT', `/api/leads/${LEAD_A}/disposition`, { auth: token('u-agb'), body: { disposition: 'to_call' } })).status).toBe(403);
  });
  test('emploi sans statut : non actif', async () => {
    expect((await call('GET', `/api/leads/gig/${GIG_A}`, { auth: token('u-nostatus') })).status).toBe(403);
  });
  test('routes de gestion refusées à l\'agent : listes globales, statistiques, couverture, compteurs, note qualité', async () => {
    for (const [method, path, body] of [['GET', '/api/leads'], ['GET', '/api/leads/filter?pipeline=p&stage=s'], ['GET', `/api/leads/company/${A}/stats`], ['GET', `/api/leads/company/${A}/rep-coverage`], ['GET', `/api/leads/company/${A}/has-leads`], ['PUT', `/api/calls/${CALL_B}/quality-score`, {}]]) {
      expect((await call(method, path, { auth: token(AG), body })).status).toBe(403);
    }
    expect((await call('GET', `/api/leads/company/${A}/stats`, { auth: token('u-a') })).status).toBe(200);
  });
  test('fiche prospect : seulement ceux de sa liste (pas un prospect affecté à un autre)', async () => {
    expect((await call('GET', `/api/leads/${LEAD_A}`, { auth: token(AG) })).status).toBe(200);
    expect((await call('GET', `/api/leads/${LEAD_A_TAKEN}`, { auth: token(AG) })).status).toBe(403);
    expect((await call('PUT', `/api/leads/${LEAD_A_TAKEN}/disposition`, { auth: token(AG), body: { disposition: 'to_call' } })).status).toBe(403);
    expect((await call('GET', `/api/leads/${LEAD_A_TAKEN}`, { auth: token('u-a') })).status).toBe(200);
  });
  test('entreprise du prospect = entreprise du gig = entreprise de l\'appelant', async () => {
    expect((await call('GET', `/api/leads/${LEAD_MISMATCH}`, { auth: token('u-a') })).status).toBe(403);
    expect((await call('GET', `/api/leads/${LEAD_MISMATCH}`, { auth: token('u-b') })).status).toBe(403);
    expect((await call('PUT', `/api/leads/${LEAD_MISMATCH}/disposition`, { auth: token(AG), body: { disposition: 'to_call' } })).status).toBe(403);
  });
  test('même identifiant d\'acteur pour la liste et la qualification (profil rep d\'abord)', async () => {
    const list = await call('GET', `/api/leads/gig/${GIG_A}`, { auth: token(AG) });
    const disp = await call('PUT', `/api/leads/${LEAD_A}/disposition`, { auth: token(AG), body: { disposition: 'to_call' } });
    expect(list.body.query.agentId).toBe(disp.body.body.agentId);
  });
});

describe('appels et prospects : corps de requête et lectures de gestion (3e relecture)', () => {
  test('PUT /calls/:id : agent CLOUD refusé ; rep seulement validByReps', async () => {
    expect((await call('PUT', `/api/calls/${CALL_A}`, { auth: token('u-ag'), body: { 'transaction.validByCompany': true } })).status).toBe(403);
    const ok = await call('PUT', `/api/calls/${CALL_REP}`, { auth: token(U_REP), body: { 'transaction.validByReps': true } });
    expect(ok.status).toBe(200);
    expect(ok.body.body).toEqual({ transaction: { validByReps: true } });
    for (const body of [{ 'transaction.validByCompany': true }, { transaction: { validByReps: true, validByCompany: true } }, { status: 'completed' }, { recording_url: 'x' }]) {
      expect((await call('PUT', `/api/calls/${CALL_REP}`, { auth: token(U_REP), body })).status).toBe(403);
    }
  });
  test('PUT /calls/:id : clés $… ou pointées refusées (400), companyId jamais modifiable', async () => {
    for (const body of [{ $set: { companyId: B } }, { $unset: { agent: 1 } }, { 'agent.x': 1 }, { notes: { $gt: '' } }, { transaction: { 'a.b': 1 } }, { transaction: { validByReps: 'oui' } }]) {
      expect((await call('PUT', `/api/calls/${CALL_A}`, { auth: token('u-a'), body })).status).toBe(400);
    }
    const r = await call('PUT', `/api/calls/${CALL_A}`, { auth: token('u-a'), body: { companyId: B, agent: 'x', recording_url: 'y', 'transaction.validByCompany': true } });
    expect(r.status).toBe(200);
    expect(r.body.body).toEqual({ agent: 'x', recording_url: 'y', transaction: { validByCompany: true } });
  });
  test('PUT /calls/:id sans jeton (compatibilité) : ni companyId, ni agent, ni enregistrement, ni validation entreprise', async () => {
    const r = await call('PUT', `/api/calls/${CALL_A}`, { body: { companyId: B, agent: 'x', recording_url: 'y', 'transaction.validByCompany': true, notes: 'n' } });
    expect(r.status).toBe(200);
    expect(r.body.body).toEqual({ notes: 'n' });
  });
  test('POST /calls : companyId imposé par la session, refus si différent', async () => {
    const r = await call('POST', '/api/calls', { auth: token('u-a'), body: { to: '+33600000000' } });
    expect(r.body.body.companyId).toBe(A);
    expect((await call('POST', '/api/calls', { auth: token('u-a'), body: { companyId: B } })).status).toBe(403);
    expect((await call('POST', '/api/calls', { auth: token('u-a'), body: { $where: '1' } })).status).toBe(400);
  });
  test('PUT /leads/:id par un membre : clés $… ou pointées refusées (400)', async () => {
    for (const body of [{ $set: { companyId: B } }, { $unset: { gigId: 1 } }, { $rename: { companyId: 'x' } }, { 'customFields.a': 'b' }, { Address: { $set: 'x' } }]) {
      expect((await call('PUT', `/api/leads/${LEAD_A}`, { auth: token('u-a'), body })).status).toBe(400);
    }
    expect((await call('PUT', `/api/leads/${LEAD_A}`, { auth: token('u-a'), body: { First_Name: 'ok' } })).status).toBe(200);
  });
  test('GET /calls par un agent CLOUD : ses propres appels seulement (agentId imposé)', async () => {
    for (const q of ['', `?companyId=${A}`, '?userId=u-a', '?agentId=forge']) {
      const r = await call('GET', `/api/calls${q}`, { auth: token('u-ag') });
      expect(r.status).toBe(200);
      expect(r.body.query.agentId).toBe('u-ag');
      expect(r.body.query.companyId).toBeUndefined();
      expect(r.body.query.userId).toBeUndefined();
    }
    expect((await call('GET', '/api/calls', { auth: token('u-a') })).body.query.companyId).toBe(A);
  });
});

describe('appel : rattachement non modifiable (4e relecture)', () => {
  test('lead, gigId, userId retirés (gestionnaire et anonyme) : un appel ne peut pas viser le prospect d\'une autre entreprise', async () => {
    const r = await call('PUT', `/api/calls/${CALL_A}`, { auth: token('u-a'), body: { lead: LEAD_B, gigId: GIG_B, userId: 'u-b', 'transaction.validByCompany': true } });
    expect(r.status).toBe(200);
    expect(r.body.body).toEqual({ transaction: { validByCompany: true } });
    const anon = await call('PUT', `/api/calls/${CALL_A}`, { body: { lead: LEAD_B, gigId: GIG_B, userId: 'u-b', notes: 'n' } });
    expect(anon.body.body).toEqual({ notes: 'n' });
  });
});
