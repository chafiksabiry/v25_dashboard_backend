// Lecture des identifiants Google depuis les variables d'environnement. Aucune vraie clé : PEM factice.
const {
  VERTEX_VARS,
  SPEECH_VARS,
  parseServiceAccountJson,
  googleAuthOptions,
  requireGoogleAuth,
  isCredentialsError,
} = require('../services/gcpCredentials');

const FAKE_PEM = '-----BEGIN PRIVATE KEY-----\nTUFVVkFJU0VDTEVGQUNUSUNFUE9VUkxFU1RFU1RT\n-----END PRIVATE KEY-----\n';
const fakeAccount = (overrides = {}) => ({
  type: 'service_account',
  project_id: 'projet-factice',
  private_key_id: 'factice0000',
  private_key: FAKE_PEM,
  client_email: 'factice@projet-factice.iam.gserviceaccount.com',
  ...overrides,
});
const quietLogger = () => ({ warn: jest.fn(), error: jest.fn() });
const allLogs = (logger) => [...logger.warn.mock.calls, ...logger.error.mock.calls].map((c) => c.join(' ')).join('\n');

describe('parseServiceAccountJson', () => {
  test('JSON valide', () => {
    const creds = parseServiceAccountJson(JSON.stringify(fakeAccount()));
    expect(creds.client_email).toBe('factice@projet-factice.iam.gserviceaccount.com');
    expect(creds.private_key).toBe(FAKE_PEM);
  });

  test('\\n littéraux de private_key remplacés par de vrais retours à la ligne, guillemets externes retirés', () => {
    // Valeur telle que collée dans Railway : les retours à la ligne sont des « \n » littéraux (double échappement).
    const escaped = JSON.stringify(fakeAccount({ private_key: FAKE_PEM.replace(/\n/g, '\\n') }));
    expect(escaped).toContain('\\\\n');
    expect(parseServiceAccountJson(escaped).private_key).toBe(FAKE_PEM);
    expect(parseServiceAccountJson(`"${escaped}"`).private_key).toBe(FAKE_PEM);
  });

  test('valeur qui n’est pas du JSON (chemin de fichier) : null ; JSON invalide : exception', () => {
    expect(parseServiceAccountJson('/secrets/sa.json')).toBeNull();
    expect(() => parseServiceAccountJson('{ pas du json')).toThrow();
  });
});

describe('googleAuthOptions / requireGoogleAuth', () => {
  test('variable valable : seuls client_email et private_key transmis, avec projectId', () => {
    const env = { VERTEX_AI_CREDENTIALS: JSON.stringify(fakeAccount({ private_key: FAKE_PEM.replace(/\n/g, '\\n') })) };
    const logger = quietLogger();
    const opts = googleAuthOptions(VERTEX_VARS, 'Vertex AI', env, logger);
    expect(opts).toEqual({
      credentials: { client_email: 'factice@projet-factice.iam.gserviceaccount.com', private_key: FAKE_PEM },
      projectId: 'projet-factice',
    });
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  test('variable absente : avertissement nommant la variable, erreur 503 au lieu d’un plantage', () => {
    const logger = quietLogger();
    const opts = googleAuthOptions(SPEECH_VARS, 'Speech-to-Text', {}, logger);
    expect(opts.credentials).toBeUndefined();
    expect(isCredentialsError(opts.configError)).toBe(true);
    expect(opts.configError.statusCode).toBe(503);
    expect(opts.configError.message).toMatch(/GCP_SPEECH_TO_TEXT_CREDENTIALS/);
    expect(allLogs(logger)).toMatch(/GCP_SPEECH_TO_TEXT_CREDENTIALS/);
    expect(() => requireGoogleAuth(SPEECH_VARS, 'Speech-to-Text', {}, quietLogger())).toThrow(/GCP_SPEECH_TO_TEXT_CREDENTIALS/);
  });

  test('JSON invalide : erreur nommant la variable, jamais sa valeur', () => {
    const secretLooking = '{"private_key": "-----BEGIN PRIVATE KEY-----\\nSECRETFACTICE';
    const logger = quietLogger();
    const opts = googleAuthOptions(VERTEX_VARS, 'Vertex AI', { VERTEX_AI_CREDENTIALS: secretLooking }, logger);
    expect(isCredentialsError(opts.configError)).toBe(true);
    const logs = allLogs(logger);
    expect(logs).toMatch(/VERTEX_AI_CREDENTIALS contient un JSON invalide/);
    expect(logs).not.toMatch(/SECRETFACTICE|BEGIN PRIVATE KEY/);
    expect(opts.configError.message).not.toMatch(/SECRETFACTICE/);
  });

  test('JSON sans client_email ou private_key : refusé', () => {
    const logger = quietLogger();
    const opts = googleAuthOptions(VERTEX_VARS, 'Vertex AI', { VERTEX_AI_CREDENTIALS: JSON.stringify({ project_id: 'p' }) }, logger);
    expect(isCredentialsError(opts.configError)).toBe(true);
    expect(allLogs(logger)).toMatch(/client_email et private_key attendus/);
  });

  test('repli GOOGLE_APPLICATION_CREDENTIALS (fichier existant) : identifiants par défaut de Google', () => {
    const env = { GOOGLE_APPLICATION_CREDENTIALS: __filename };
    expect(googleAuthOptions(SPEECH_VARS, 'Speech-to-Text', env, quietLogger())).toEqual({});
    expect(requireGoogleAuth(VERTEX_VARS, 'Vertex AI', env, quietLogger())).toEqual({});
  });

  test('GOOGLE_APPLICATION_CREDENTIALS vers un fichier introuvable : non configuré', () => {
    const logger = quietLogger();
    const opts = googleAuthOptions(SPEECH_VARS, 'Speech-to-Text', { GOOGLE_APPLICATION_CREDENTIALS: '/introuvable/sa.json' }, logger);
    expect(isCredentialsError(opts.configError)).toBe(true);
    expect(allLogs(logger)).toMatch(/GOOGLE_APPLICATION_CREDENTIALS/);
  });
});

describe('routes : erreur claire sans identifiants', () => {
  const resMock = () => ({ status: jest.fn(function s() { return this; }), json: jest.fn(function j() { return this; }) });

  beforeEach(() => {
    jest.resetModules();
    delete process.env.VERTEX_AI_CREDENTIALS;
    delete process.env.GCP_VERTEX_AI_CREDENTIALS;
    delete process.env.GCP_SPEECH_TO_TEXT_CREDENTIALS;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  });

  test('Speech-to-Text : 503 nommant GCP_SPEECH_TO_TEXT_CREDENTIALS', async () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const controller = require('../controllers/speech-to-text');
    const res = resMock();
    await controller.transcribeLongAudio({ body: { languageCode: 'fr-FR', fileUri: 'gs://b/f.wav' } }, res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json.mock.calls[0][0].error).toMatch(/GCP_SPEECH_TO_TEXT_CREDENTIALS/);
    spy.mockRestore();
  });

  test('Vertex AI : 503 nommant VERTEX_AI_CREDENTIALS', async () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const controller = require('../controllers/vertex');
    const res = resMock();
    await controller.getAudioTranscription({ body: { file_uri: 'gs://b/f.mp3' } }, res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json.mock.calls[0][0].error).toMatch(/VERTEX_AI_CREDENTIALS/);
    spy.mockRestore();
  });
});

test('aucun fichier de clé Google dans le dépôt', () => {
  const fs = require('fs'); const path = require('path');
  expect(fs.existsSync(path.join(__dirname, '../config/vertexServiceAccount.json'))).toBe(false);
  expect(fs.existsSync(path.join(__dirname, '../config/speechToTextServiceAccount.json'))).toBe(false);
});
