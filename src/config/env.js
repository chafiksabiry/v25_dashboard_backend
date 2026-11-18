require('dotenv').config();

/**
 * Aucun secret par défaut : JWT_SECRET doit être posé (Railway). Sans lui, `assertRequiredEnv()` (appelé au démarrage par
 * app.js) arrête le service avec un message explicite, et les middlewares d'authentification refusent tous les jetons.
 */
const config = {
  PORT: process.env.PORT || 3000,
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/harx',
  JWT_SECRET: process.env.JWT_SECRET || '',
  JWT_EXPIRE: process.env.JWT_EXPIRE || '24h',
  NODE_ENV: process.env.NODE_ENV || 'development',
  ZOHO_AUTH_URL: process.env.ZOHO_AUTH_URL,
  ZOHO_CLIENT_ID: process.env.ZOHO_CLIENT_ID,
  ZOHO_CLIENT_SECRET: process.env.ZOHO_CLIENT_SECRET,
  ZOHO_SCOPE: process.env.ZOHO_SCOPE,
  ZOHO_REDIRECT_URI: process.env.ZOHO_REDIRECT_URI,
  ZOHO_TOKEN_URL: process.env.ZOHO_TOKEN_URL,
  ZOHO_API_URL: process.env.ZOHO_API_URL,
  REACT_APP_URL: process.env.REACT_APP_URL,
  BACKEND_URL: process.env.BACKEND_URL,
  ZOHO_SALESIQ_PORTAL_ID: process.env.ZOHO_SALESIQ_PORTAL_ID,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
};

/** Variables sans lesquelles le service ne doit pas démarrer. */
function missingRequiredEnv(env = process.env) {
  return String(env.JWT_SECRET || '').trim() ? [] : ['JWT_SECRET'];
}

function assertRequiredEnv(env = process.env) {
  const missing = missingRequiredEnv(env);
  if (missing.length) {
    throw new Error(`Configuration incomplète : variable(s) ${missing.join(', ')} absente(s). Le service refuse de démarrer.`);
  }
}

module.exports = { config, missingRequiredEnv, assertRequiredEnv };