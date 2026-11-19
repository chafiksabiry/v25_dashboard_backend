/**
 * Identifiants Google Cloud lus UNIQUEMENT dans les variables d'environnement (aucune clé dans le dépôt, aucun fichier écrit).
 * Mêmes noms de variables que le service des appels (v25_dash_calls_backend, vertexai.service.js).
 *
 * Chaque variable contient le JSON complet d'un compte de service. Les guillemets entourant la valeur sont retirés et les `\n`
 * littéraux de `private_key` sont remplacés par de vrais retours à la ligne (cas courant quand le JSON est collé dans Railway).
 * Seuls `client_email` et `private_key` sont transmis aux clients Google, avec `projectId` (= `project_id`).
 *
 * Repli : GOOGLE_APPLICATION_CREDENTIALS désignant un fichier hors dépôt (identifiants par défaut de Google, ADC).
 * Sans variable valable ni fichier : avertissement nommant la variable au démarrage, puis la fonctionnalité concernée répond
 * par une erreur claire (503) ; le serveur démarre normalement. La valeur d'une variable n'est jamais journalisée.
 */
const fs = require('fs');

const ADC_PATH_VAR = 'GOOGLE_APPLICATION_CREDENTIALS';
const VERTEX_VARS = ['VERTEX_AI_CREDENTIALS', 'GCP_VERTEX_AI_CREDENTIALS', ADC_PATH_VAR];
const SPEECH_VARS = ['GCP_SPEECH_TO_TEXT_CREDENTIALS', ADC_PATH_VAR];
// Stockage : à défaut de variable dédiée, le compte de service Vertex (comportement historique).
const STORAGE_VARS = ['CLOUD_STORAGE_CREDENTIALS', 'GCP_STORAGE_CREDENTIALS', 'GCP_CLOUD_STORAGE_CREDENTIALS', ...VERTEX_VARS];

const MISSING_CODE = 'GCP_CREDENTIALS_MISSING';

/** Fonctionnalité Google non configurée : à renvoyer en 503 avec ce message (il ne contient jamais de valeur). */
class GcpCredentialsError extends Error {
  constructor(label, variable) {
    super(`${label} non configuré : variable ${variable} absente ou invalide.`);
    this.name = 'GcpCredentialsError';
    this.code = MISSING_CODE;
    this.statusCode = 503;
    this.variable = variable;
  }
}

const isCredentialsError = (error) => Boolean(error && error.code === MISSING_CODE);

/** JSON de compte de service -> objet (null si la valeur n'est pas du JSON). Lève une erreur si le JSON est invalide. */
function parseServiceAccountJson(raw) {
  let sanitized = String(raw || '').trim();
  if (sanitized.startsWith('"') && sanitized.endsWith('"')) sanitized = sanitized.slice(1, -1).trim();
  if (!sanitized.startsWith('{')) return null;
  const creds = JSON.parse(sanitized);
  if (creds && typeof creds.private_key === 'string') creds.private_key = creds.private_key.replace(/\\n/g, '\n');
  return creds;
}

/**
 * Premier compte de service valable parmi `names`.
 * @returns {{ credentials?: object, source: string|null, adcFile?: string, error?: string }}
 */
function readServiceAccount(names, env = process.env) {
  const errors = [];
  let adcFile;
  for (const name of names) {
    const raw = env[name];
    if (!raw || !String(raw).trim()) continue;
    try {
      const credentials = parseServiceAccountJson(raw);
      if (!credentials && name === ADC_PATH_VAR) {
        adcFile = String(raw).trim(); // chemin de fichier : géré par ADC
        continue;
      }
      if (credentials && credentials.client_email && credentials.private_key) return { credentials, source: name };
      errors.push(`${name} ne contient pas le JSON d'un compte de service (client_email et private_key attendus)`);
    } catch (error) {
      errors.push(`${name} contient un JSON invalide`);
    }
  }
  return { source: null, ...(adcFile ? { adcFile } : {}), ...(errors.length ? { error: errors.join(' ; ') } : {}) };
}

/**
 * Options d'authentification pour les clients Google (VertexAI.googleAuthOptions, SpeechClient, Storage).
 * `label` sert seulement aux messages. Avec un compte de service : `{ credentials: { client_email, private_key }, projectId? }` ;
 * avec GOOGLE_APPLICATION_CREDENTIALS (fichier existant) : `{}` (ADC) ; sinon `{ configError }` (GcpCredentialsError).
 */
function googleAuthOptions(names, label, env = process.env, logger = console) {
  const found = readServiceAccount(names, env);
  if (found.credentials) {
    const { client_email, private_key, project_id } = found.credentials;
    return { credentials: { client_email, private_key }, ...(project_id ? { projectId: project_id } : {}) };
  }
  if (found.error) logger.error(`❌ [gcpCredentials] ${label} : ${found.error}.`);
  if (found.adcFile) {
    if (fs.existsSync(found.adcFile)) return {};
    logger.error(`❌ [gcpCredentials] ${label} : ${ADC_PATH_VAR} désigne un fichier introuvable.`);
  } else if (!found.error) {
    logger.warn(`⚠️ [gcpCredentials] ${label} : variable ${names[0]} non définie (ni ${names.slice(1).join(', ')}).`);
  }
  logger.warn(`⚠️ [gcpCredentials] ${label} indisponible tant que ${names[0]} n'est pas définie (JSON complet du compte de service).`);
  return { configError: new GcpCredentialsError(label, names[0]) };
}

/** Comme googleAuthOptions, mais lève la GcpCredentialsError si la fonctionnalité n'est pas configurée. */
function requireGoogleAuth(names, label, env = process.env, logger = console) {
  const { configError, ...options } = googleAuthOptions(names, label, env, logger);
  if (configError) throw configError;
  return options;
}

module.exports = {
  VERTEX_VARS,
  SPEECH_VARS,
  STORAGE_VARS,
  GcpCredentialsError,
  isCredentialsError,
  parseServiceAccountJson,
  readServiceAccount,
  googleAuthOptions,
  requireGoogleAuth,
};
