// Le service Speech-to-Text doit être chargé réellement (non simulé) : un fichier vide passait le test précédent.
const mockRecognize = jest.fn();
const mockCtor = jest.fn();
jest.mock('@google-cloud/speech', () => ({
  SpeechClient: function SpeechClient(options) {
    mockCtor(options);
    this.longRunningRecognize = mockRecognize;
  },
}));

const sa = { project_id: 'p1', client_email: 'x@p1.iam.gserviceaccount.com', private_key: 'a\\nb' };

beforeEach(() => {
  jest.resetModules();
  mockCtor.mockClear();
  mockRecognize.mockReset();
  process.env.GCP_SPEECH_TO_TEXT_CREDENTIALS = JSON.stringify(sa);
});
afterAll(() => { delete process.env.GCP_SPEECH_TO_TEXT_CREDENTIALS; });

test('le service exporte transcribeLongAudio', () => {
  expect(typeof require('../services/speech-to-text').transcribeLongAudio).toBe('function');
});

test('transcription : client créé avec GCP_SPEECH_TO_TEXT_CREDENTIALS, texte assemblé', async () => {
  mockRecognize.mockResolvedValue([{ promise: async () => [{ results: [{ alternatives: [{ transcript: 'bonjour' }] }, { alternatives: [{ transcript: 'monde' }] }] }] }]);
  const out = await require('../services/speech-to-text').transcribeLongAudio('fr-FR', 'gs://b/f.wav');
  expect(out).toBe('bonjour\nmonde');
  expect(mockCtor).toHaveBeenCalledTimes(1);
  expect(mockCtor.mock.calls[0][0].credentials.private_key).toBe('a\nb');
  expect(mockRecognize.mock.calls[0][0].audio.uri).toBe('gs://b/f.wav');
});

test('route /api/speechToText/transcribe : contrôleur réel branché sur le service', async () => {
  mockRecognize.mockResolvedValue([{ promise: async () => [{ results: [{ alternatives: [{ transcript: 'ok' }] }] }] }]);
  const controller = require('../controllers/speech-to-text');
  const res = { status: jest.fn(function s() { return this; }), json: jest.fn(function j() { return this; }), send: jest.fn(function s() { return this; }) };
  await controller.transcribeLongAudio({ body: { languageCode: 'fr-FR', fileUri: 'gs://b/f.wav' } }, res);
  const statuses = res.status.mock.calls.map((c) => c[0]);
  expect(statuses).not.toContain(500);
  expect(mockRecognize).toHaveBeenCalled();
});
