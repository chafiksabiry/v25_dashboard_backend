import dotenv from "dotenv";

dotenv.config();

export default {
  client_id: process.env.ZOHO_CLIENT_ID!,
  client_secret: process.env.ZOHO_CLIENT_SECRET!,
  redirect_uri: process.env.ZOHO_REDIRECT_URI!,
  auth_url: process.env.ZOHO_AUTH_URL!,
  token_url: process.env.ZOHO_TOKEN_URL!,
};
