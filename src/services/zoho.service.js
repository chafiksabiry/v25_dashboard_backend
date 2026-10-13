const axios = require('axios');
const zohoConfig = require('../config/zoho.config');

const ZOHO_ACCOUNTS_TOKEN_URLS = [
    'https://accounts.zoho.eu/oauth/v2/token',
    'https://accounts.zoho.com/oauth/v2/token',
    'https://accounts.zoho.in/oauth/v2/token',
    'https://accounts.zoho.com.au/oauth/v2/token',
    'https://accounts.zoho.jp/oauth/v2/token',
    'https://accounts.zohocloud.ca/oauth/v2/token',
    'https://accounts.zoho.sa/oauth/v2/token',
];

function tokenUrlFromAccountsServer(accountsServer) {
    if (!accountsServer) return null;
    const base = String(accountsServer).replace(/\/+$/, '');
    if (!base.startsWith('http')) return null;
    if (base.includes('/oauth/')) return base;
    return `${base}/oauth/v2/token`;
}

function tokenUrlFromApiDomain(apiDomain) {
    if (!apiDomain) return null;
    try {
        const host = new URL(apiDomain).hostname;
        if (host.endsWith('zohoapis.ca')) return 'https://accounts.zohocloud.ca/oauth/v2/token';
        const suffix = host.replace(/^www\.zohoapis\./, '');
        if (!suffix || suffix === host) return null;
        return `https://accounts.zoho.${suffix}/oauth/v2/token`;
    } catch {
        return null;
    }
}

class ZohoService {
    constructor(config = null) {
        this.accessToken = null;
        this.config = config || zohoConfig;
        this.validateConfig();
    }

    validateConfig() {
        const requiredFields = ['clientId', 'clientSecret', 'redirectUri', 'authUrl', 'tokenUrl', 'apiBaseUrl',];
        const missingFields = requiredFields.filter(field => !this.config[field]);
        
        if (missingFields.length > 0) {
            console.warn('Using default Zoho configuration. For production, please set the following environment variables:', missingFields);
            console.warn('Current configuration:', {
                clientId: this.config.clientId,
                redirectUri: this.config.redirectUri,
                authUrl: this.config.authUrl,
                tokenUrl: this.config.tokenUrl,
                apiBaseUrl: this.config.apiBaseUrl
            });
        }
    }

    async getAuthUrl(customConfig = null) {
        const config = customConfig || this.config;
        const params = new URLSearchParams({
            client_id: config.clientId,
            response_type: 'code',
            redirect_uri: config.redirectUri,
            access_type: 'offline',
            scope: config.scope || 'ZohoCRM.modules.ALL',
            state: config.state || ''
        });

        return `${config.authUrl}?${params.toString()}`;
    }

    async getAccessToken(code, customConfig = null, accountsServer = null) {
        try {
            const config = customConfig || this.config;
            const tokenUrl = tokenUrlFromAccountsServer(accountsServer) || config.tokenUrl;
            console.log('Getting access token with code:', code);
            console.log('Token URL:', tokenUrl);
            console.log('Request params:', {
                code,
                client_id: config.clientId,
                redirect_uri: config.redirectUri,
                grant_type: 'authorization_code'
            });

            const response = await axios.post(tokenUrl, new URLSearchParams({
                code,
                client_id: config.clientId,
                client_secret: config.clientSecret,
                redirect_uri: config.redirectUri,
                grant_type: 'authorization_code',
            }).toString(), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                validateStatus: () => true,
            });

            console.log('Token response:', response.data);

            if (!response.data.access_token || !response.data.refresh_token || !response.data.expires_in) {
                console.error('Invalid token response:', response.data);
                throw new Error('Invalid token response from Zoho');
            }

            this.accessToken = response.data.access_token;
            return response.data;
        } catch (error) {
            console.error('Error getting access token:', {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status
            });
            throw error;
        }
    }

    async refreshToken(refreshToken) {
        const data = await this.refreshAccessToken({
            refreshToken,
            clientId: this.config.clientId,
            clientSecret: this.config.clientSecret,
            fallbackTokenUrl: this.config.tokenUrl,
        });
        this.accessToken = data.access_token;
        return data;
    }

    /**
     * Zoho refresh tokens only work on the accounts host that issued them
     * (accounts.zoho.eu, .com, …). A .com call with an EU token returns
     * invalid_code / invalid_client, which is not invalid_grant.
     */
    async refreshAccessToken({
        refreshToken,
        clientId,
        clientSecret,
        apiDomain,
        accountsServer,
        fallbackClientId,
        fallbackClientSecret,
        fallbackTokenUrl,
    }) {
        const urls = [];
        const addUrl = (value) => {
            if (!value || urls.includes(value)) return;
            urls.push(value);
        };
        addUrl(tokenUrlFromAccountsServer(accountsServer));
        addUrl(tokenUrlFromApiDomain(apiDomain));
        addUrl(fallbackTokenUrl || this.config.tokenUrl);
        ZOHO_ACCOUNTS_TOKEN_URLS.forEach(addUrl);

        const credentials = [];
        const addCred = (id, secret) => {
            if (!id || !secret || String(id).includes('XXXX')) return;
            if (credentials.some((item) => item.id === id && item.secret === secret)) return;
            credentials.push({ id, secret });
        };
        addCred(clientId, clientSecret);
        addCred(fallbackClientId, fallbackClientSecret);
        addCred(this.config.clientId, this.config.clientSecret);

        if (!refreshToken || credentials.length === 0) {
            const error = new Error('Missing Zoho refresh credentials');
            error.zohoError = 'missing_credentials';
            throw error;
        }

        let lastError = 'refresh_failed';
        for (const cred of credentials) {
            for (const url of urls) {
                const body = new URLSearchParams({
                    refresh_token: refreshToken,
                    client_id: cred.id,
                    client_secret: cred.secret,
                    grant_type: 'refresh_token',
                });
                const response = await axios.post(url, body.toString(), {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    timeout: 20000,
                    validateStatus: () => true,
                });
                if (response.data?.access_token) {
                    return {
                        ...response.data,
                        tokenUrl: url,
                        clientId: cred.id,
                        clientSecret: cred.secret,
                    };
                }
                lastError = response.data?.error || response.data?.message || `HTTP ${response.status}`;
                console.warn('Zoho token refresh rejected', { url, error: lastError });
            }
        }

        const error = new Error(String(lastError));
        error.zohoError = lastError;
        throw error;
    }

    async makeApiRequest(endpoint, method = 'GET', data = null) {
        if (!this.accessToken) {
            throw new Error('No access token available');
        }

        try {
            const response = await axios({
                method,
                url: `${this.config.apiBaseUrl}${endpoint}`,
                headers: {
                    'Authorization': `Zoho-oauthtoken ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                data
            });

            return response.data;
        } catch (error) {
            console.error('Error making API request:', error);
            throw error;
        }
    }
}

module.exports = new ZohoService(); 