const axios = require('axios');
const zohoConfig = require('../config/zoho.config');

class ZohoService {
    constructor() {
        this.accessToken = null;
        this.validateConfig();
    }

    validateConfig() {
        const requiredFields = ['clientId', 'clientSecret', 'redirectUri', 'authUrl', 'tokenUrl', 'apiBaseUrl'];
        const missingFields = requiredFields.filter(field => !zohoConfig[field]);
        
        if (missingFields.length > 0) {
            console.error('Missing required Zoho configuration:', missingFields);
            throw new Error(`Missing required Zoho configuration: ${missingFields.join(', ')}`);
        }
    }

    async getAuthUrl() {
        const params = new URLSearchParams({
            client_id: zohoConfig.clientId,
            response_type: 'code',
            redirect_uri: zohoConfig.redirectUri,
            access_type: 'offline',
            scope: zohoConfig.scope || 'ZohoCRM.modules.ALL'
        });

        return `${zohoConfig.authUrl}?${params.toString()}`;
    }

    async getAccessToken(code) {
        try {
            console.log('Getting access token with code:', code);
            console.log('Token URL:', zohoConfig.tokenUrl);
            console.log('Request params:', {
                code,
                client_id: zohoConfig.clientId,
                redirect_uri: zohoConfig.redirectUri,
                grant_type: 'authorization_code'
            });

            const response = await axios.post(zohoConfig.tokenUrl, null, {
                params: {
                    code,
                    client_id: zohoConfig.clientId,
                    client_secret: zohoConfig.clientSecret,
                    redirect_uri: zohoConfig.redirectUri,
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
            const response = await axios.post(zohoConfig.tokenUrl, null, {
                params: {
                    refresh_token: refreshToken,
                    client_id: zohoConfig.clientId,
                    client_secret: zohoConfig.clientSecret,
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
                url: `${zohoConfig.apiBaseUrl}${endpoint}`,
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