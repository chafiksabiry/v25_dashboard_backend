module.exports = {
    clientId: process.env.ZOHO_CLIENT_ID || '1000.XXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    clientSecret: process.env.ZOHO_CLIENT_SECRET || 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    redirectUri: process.env.ZOHO_REDIRECT_URI || 'https://api-dashboard.harx.ai/api/zoho/auth/callback',
    authUrl: process.env.ZOHO_AUTH_URL || 'https://accounts.zoho.com/oauth/v2/auth',
    tokenUrl: process.env.ZOHO_TOKEN_URL || 'https://accounts.zoho.com/oauth/v2/token',
    apiBaseUrl: process.env.ZOHO_API_URL || 'https://www.zohoapis.com/crm/v2.1',
    scope: process.env.ZOHO_SCOPE || 'ZohoCRM.modules.ALL',
    salesIQPortal: process.env.ZOHO_SALESIQ_PORTAL
}; 