process.env.JWT_SECRET = 'test-secret';
process.env.REGISTRATION_BACKEND_URL = 'https://reg.example';

const mockCall = { find: jest.fn(), findById: jest.fn(), findByIdAndUpdate: jest.fn(), distinct: jest.fn() };
const mockAgent = { find: jest.fn() };
const mockLead = { find: jest.fn() };
jest.mock('../models/Call', () => ({ Call: mockCall }));
jest.mock('../models/Agent', () => ({ Agent: mockAgent }));
jest.mock('../models/Lead', () => ({ Lead: mockLead }));
jest.mock('../models/Gig', () => ({ Gig: { find: jest.fn() } }));
jest.mock('../models/Transaction', () => ({}));
jest.mock('../services/CallService', () => ({ CallService: function CallService() {} }));

const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const { clearCompanyCache } = require('../middleware/companyScope');
const { canListenRecordings } = require('../utils/recordingAccess');

const COMPANY = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const OTHER = 'bbbbbbbbbbbbbbbbbbbbbbb2';
const CALL_ID = 'cccccccccccccccccccccca1';
const TWILIO = 'https://api.twilio.com/2010-04-01/Accounts/AC1/Recordings/RE1.mp3';
const CLOUD = 'https://res.cloudinary.com/demo/video/upload/V25_Call_Records/a.mp3';

// Sessions renvoyées par le service d'inscription (GET /api/company-members/me).
const SESSIONS = {
  owner: { isOwner: true, companyId: COMPANY, permissions: { 'calls.listen': true } },
  listener: { isOwner: false, companyId: COMPANY, permissions: { 'calls.listen': true } },
  secretary: { isOwner: false, companyId: COMPANY, permissions: { 'calls.view': true, 'calls.listen': false } },
  'owner-unproven': { companyId: COMPANY, preset: 'owner', permissions: { 'calls.view': true } },
  'agent-flagged-owner': { isOwner: true, isAgent: true, companyId: COMPANY, permissions: {} },
  freelance: { isOwner: true, companyId: null, permissions: { 'calls.listen': true } },
};
const token = (userId) => jwt.sign({ userId }, 'test-secret');
const callDoc = (o = {}) => {
  const fields = { _id: CALL_ID, companyId: COMPANY, status: 'active', recording_url: TWILIO, recording_url_cloudinary: CLOUD, ...o };
  return { ...fields, toJSON: () => ({ ...fields }) };
};
const chain = (rows) => { const p = { populate: () => p, select: () => p, sort: () => p, limit: () => p, then: (ok, ko) => Promise.resolve(rows).then(ok, ko) }; return p; };

let server; let port; let realFetch;
const get = (path, auth, method = 'GET') => new Promise((resolve, reject) => {
  const r = http.request({ host: '127.0.0.1', port, method, path, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) } }, (res) => {
    let raw = ''; res.on('data', (c) => { raw += c; });
    res.on('end', () => resolve({ status: res.statusCode, body: raw ? JSON.parse(raw) : null }));
  });
  r.on('error', reject);
  if (method !== 'GET') r.write('{}');
  r.end();
});

beforeAll(() => { realFetch = global.fetch; });
beforeEach(async () => {
  jest.resetModules();
  clearCompanyCache();
  require('../middleware/companyScope').clearCompanyCache();
  [...Object.values(mockCall), mockAgent.find, mockLead.find].forEach((f) => f.mockReset());
  mockCall.find.mockImplementation(() => chain([callDoc()]));
  mockCall.findById.mockImplementation(() => chain(callDoc()));
  mockCall.distinct.mockResolvedValue([]);
  mockAgent.find.mockImplementation(() => chain([]));
  mockLead.find.mockImplementation(() => chain([]));
  delete process.env.DASHBOARD_REQUIRE_AUTH; delete process.env.DASHBOARD_LEGACY_ANON; delete process.env.COMPANY_SCOPE_MODE;
  // Garde d'un appel par identifiant (lecture brute de la collection calls).
  const mongoose = require('mongoose');
  Object.defineProperty(mongoose.connection, 'db', {
    configurable: true,
    get: () => ({ collection: (name) => ({ findOne: async () => (name === 'calls' ? { _id: CALL_ID, companyId: COMPANY } : null) }) }),
  });
  const app = express();
  app.use(express.json());
  app.use('/api/calls', require('../routes/calls'));
  app.use('/api/analytics', require('../routes/analytics'));
  app.use('/api/dashboard', require('../routes/dashboard'));
  await new Promise((r) => { server = app.listen(0, '127.0.0.1', r); });
  port = server.address().port;
  global.fetch = jest.fn(async (url) => {
    const userId = new URL(url).searchParams.get('userId');
    return { ok: true, json: async () => ({ success: true, data: SESSIONS[userId] || { companyId: null } }) };
  });
});
afterEach(async () => { await new Promise((r) => server.close(r)); global.fetch = realFetch; });

describe('règle d’écoute', () => {
  test('titulaire prouvé ou calls.listen : oui ; sinon non', () => {
    expect(canListenRecordings(SESSIONS.owner)).toBe(true);
    expect(canListenRecordings(SESSIONS.listener)).toBe(true);
    expect(canListenRecordings(SESSIONS.secretary)).toBe(false);
    expect(canListenRecordings(SESSIONS['owner-unproven'])).toBe(false);
    expect(canListenRecordings(SESSIONS['agent-flagged-owner'])).toBe(false);
    expect(canListenRecordings(null)).toBe(false);
  });
});

describe('GET /api/calls et /api/calls/:id', () => {
  test('titulaire prouvé et calls.listen : URL renvoyées', async () => {
    for (const who of ['owner', 'listener']) {
      const list = await get(`/api/calls?companyId=${COMPANY}`, token(who));
      expect(list.status).toBe(200);
      expect(list.body.data[0].recording_url).toBe(TWILIO);
      const one = await get(`/api/calls/${CALL_ID}`, token(who));
      expect(one.body.data.recording_url_cloudinary).toBe(CLOUD);
    }
  });
  test('secrétaire sans permission, rôle owner non prouvé : null', async () => {
    for (const who of ['secretary', 'owner-unproven', 'agent-flagged-owner']) {
      const list = await get(`/api/calls?companyId=${COMPANY}`, token(who));
      expect(list.status).toBe(200);
      expect(list.body.data[0]).toMatchObject({ _id: CALL_ID, recording_url: null, recording_url_cloudinary: null });
      const one = await get(`/api/calls/${CALL_ID}`, token(who));
      expect(one.body.data).toMatchObject({ recording_url: null, recording_url_cloudinary: null });
    }
  });
  test('anonyme toléré (compatibilité) : null, sans lecture de session', async () => {
    const list = await get(`/api/calls?companyId=${COMPANY}`);
    expect(list.status).toBe(200);
    expect(list.body.data[0].recording_url).toBeNull();
    expect(list.body.data[0].recording_url_cloudinary).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });
  test('service d’inscription indisponible : fermé (503 au contrôle d’entreprise, jamais d’URL)', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({}) }));
    const r = await get(`/api/calls?companyId=${COMPANY}`, token('owner'));
    expect(r.status).toBe(503);
  });
  test('POST /api/calls : réponse filtrée pour la secrétaire', async () => {
    mockCall.create = jest.fn(async () => ({ _id: CALL_ID }));
    const r = await get('/api/calls', token('secretary'), 'POST');
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ recording_url: null, recording_url_cloudinary: null });
  });
  test('PUT /api/calls/:id : réponse filtrée pour la secrétaire', async () => {
    mockCall.findByIdAndUpdate.mockResolvedValue({ _id: CALL_ID });
    const r = await get(`/api/calls/${CALL_ID}`, token('secretary'), 'PUT');
    expect(r.status).toBe(200);
    expect(r.body.data.recording_url).toBeNull();
  });
});

describe('/api/analytics et /api/dashboard', () => {
  test('sans jeton 401 ; compte sans entreprise 403 ; aucune lecture', async () => {
    expect((await get('/api/dashboard/live-calls')).status).toBe(401);
    expect((await get('/api/analytics/calls')).status).toBe(401);
    expect((await get('/api/dashboard/live-calls', token('freelance'))).status).toBe(403);
    expect(mockCall.find).not.toHaveBeenCalled();
  });
  test('live-calls et analytics/calls : entreprise de l’appelant (paramètre ignoré), URL selon le droit', async () => {
    let r = await get(`/api/dashboard/live-calls?companyId=${OTHER}`, token('secretary'));
    expect(r.status).toBe(200);
    expect(mockCall.find).toHaveBeenLastCalledWith({ companyId: COMPANY, status: 'active' });
    expect(r.body.data[0].recording_url).toBeNull();
    expect(r.body.data[0].recording_url_cloudinary).toBeNull();

    r = await get(`/api/analytics/calls?companyId=${OTHER}`, token('owner'));
    expect(r.status).toBe(200);
    expect(mockCall.find).toHaveBeenLastCalledWith({ companyId: COMPANY });
    expect(r.body.data[0].recording_url_cloudinary).toBe(CLOUD);
  });
  test('overview, quality, agents, stats, top-gigs, top-reps : lectures limitées à l’entreprise', async () => {
    for (const path of ['/api/analytics/overview', '/api/analytics/quality', '/api/analytics/agents', '/api/dashboard/stats', '/api/dashboard/top-gigs', '/api/dashboard/top-reps']) {
      expect((await get(path, token('owner'))).status).toBe(200);
    }
    for (const [q] of mockCall.find.mock.calls) expect(q.companyId).toBe(COMPANY);
    for (const [, q] of mockCall.distinct.mock.calls) expect(q.companyId).toBe(COMPANY);
    for (const [q] of mockLead.find.mock.calls) expect(q).toEqual({ companyId: COMPANY });
    for (const [q] of mockAgent.find.mock.calls) expect(q).toEqual({ _id: { $in: [] } });
  });
});

describe('écoute : entreprise principale seulement (agent multi-centres)', () => {
  test('un appel d’une entreprise atteinte par companyIds / emploi n’expose jamais son enregistrement', async () => {
    const { applyRecordingAccess } = require('../utils/recordingAccess');
    const req = { auth: { userId: 'multi' }, canListenRecordings: true, listenCompanyId: OTHER };
    const [own, other, unknown] = await applyRecordingAccess(req, [callDoc({ companyId: OTHER }), callDoc({ companyId: COMPANY }), callDoc({ companyId: null })]);
    expect(own.recording_url).toBe(TWILIO);
    expect(other.recording_url).toBeNull();
    expect(other.recording_url_cloudinary).toBeNull();
    expect(unknown.recording_url).toBe(TWILIO);
    expect((await applyRecordingAccess(req, callDoc({ companyId: COMPANY }))).recording_url).toBeNull();
  });
  test('/api/calls d’une entreprise atteinte par un emploi : refusée (accès membre réservé à l’entreprise principale)', async () => {
    SESSIONS.multi = { isOwner: true, companyId: OTHER, permissions: { 'calls.listen': true }, employments: [{ companyId: COMPANY, status: 'active' }] };
    expect((await get(`/api/calls?companyId=${COMPANY}`, token('multi'))).status).toBe(403);
    expect((await get(`/api/calls/${CALL_ID}`, token('multi'))).status).toBe(403);
  });
});
