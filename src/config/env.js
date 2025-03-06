require('dotenv').config();

const config = {
  PORT: process.env.PORT || 3000,
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/harx',
  JWT_SECRET: process.env.JWT_SECRET || 'your-secret-key',
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
};


module.exports = { config };