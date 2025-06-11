const axios = require('axios');
const zohoConfig = require('../config/zoho.config');

class ZohoService {
    constructor() {
        this.accessToken = null;
    }

    async getAuthUrl() {
        const params = new URLSearchParams({
            client_id: zohoConfig.clientId,
            response_type: 'code',
            redirect_uri: zohoConfig.redirectUri,
            access_type: 'offline',
            scope: 'ZohoCRM.modules.ALL'
        });

        return `${zohoConfig.authUrl}?${params.toString()}`;
    }

    async getAccessToken(code) {
        try {
            const response = await axios.post(zohoConfig.tokenUrl, null, {
                params: {
                    code,
                    client_id: zohoConfig.clientId,
                    client_secret: zohoConfig.clientSecret,
                    redirect_uri: zohoConfig.redirectUri,
                    grant_type: 'authorization_code'
                }
            });

            this.accessToken = response.data.access_token;
            return response.data;
        } catch (error) {
            console.error('Error getting access token:', error);
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