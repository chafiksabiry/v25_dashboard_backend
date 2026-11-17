// Garde de non-régression : les copies des routes du copilote REP (contrôle de gig, configure-voice)
// ne doivent pas être réexposées sans authentification par ce service. Elles sont servies et protégées
// par l'orchestrateur (v25_comporchestrator_back, middleware copilotScope).
// Test statique : src/routes/phoneNumber.js est un module ESM dans un paquet CommonJS (non chargeable par
// jest sans transformation) et importe `telnyx`, absent des dépendances.
const fs = require('fs');
const path = require('path');

const routesSrc = fs.readFileSync(path.join(__dirname, '..', 'routes', 'phoneNumber.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

describe('routes copilote REP de phoneNumber.js', () => {
  test("le contrôleur n'est plus branché sur check ni configure-voice", () => {
    expect(routesSrc).not.toMatch(/checkGigNumber/);
    expect(routesSrc).not.toMatch(/configureVoiceFeature/);
  });

  test('les deux chemins répondent 410 via goneCopilotRoute', () => {
    expect(routesSrc).toMatch(/router\.get\('\/gig\/:gigId\/check',\s*goneCopilotRoute\)/);
    expect(routesSrc).toMatch(/router\.post\('\/:phoneNumber\/configure-voice',\s*goneCopilotRoute\)/);
    expect(routesSrc).toMatch(/res\.status\(410\)/);
  });

  test("le routeur phoneNumber n'est pas monté dans app.js", () => {
    expect(appSrc).not.toMatch(/routes\/phoneNumber/);
    expect(appSrc).not.toMatch(/phone-numbers/);
  });
});
