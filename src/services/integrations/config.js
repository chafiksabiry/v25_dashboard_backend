import dotenv from "dotenv";

dotenv.config();

export const config = {
  PORT: process.env.PORT || 5005,
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
