const axios = require('axios');
const zohoConfig = require('../config/zoho.config');

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

    async getAccessToken(code, customConfig = null) {
        try {
            const config = customConfig || this.config;
            console.log('Getting access token with code:', code);
            console.log('Token URL:', config.tokenUrl);
            console.log('Request params:', {
                code,
                client_id: config.clientId,
                redirect_uri: config.redirectUri,
                grant_type: 'authorization_code'
            });

            const response = await axios.post(config.tokenUrl, null, {
                params: {
                    code,
                    client_id: config.clientId,
                    client_secret: config.clientSecret,
                    redirect_uri: config.redirectUri,
                    grant_type: 'authorization_code'
                }
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
        try {
            const response = await axios.post(this.config.tokenUrl, null, {
                params: {
                    refresh_token: refreshToken,
                    client_id: this.config.clientId,
                    client_secret: this.config.clientSecret,
                    grant_type: 'refresh_token'
                }
            });

            this.accessToken = response.data.access_token;
            return response.data;
        } catch (error) {
            console.error('Error refreshing token:', error);
            throw error;
        }
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