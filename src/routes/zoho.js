require("dotenv").config();
const express = require("express");
const axios = require("axios");
const mongoose = require('mongoose');
const {
  getLeads,
  saveLeads,
  updateLead,
  getDeals,
  getContacts,
  getDealsCount,
  getChats,
  getCoversationMessages,
  sendMessageToConversation,
  getFolders,
  getSentEmails,
  getInboxEmails,
  getArchivedEmails,
  getLeadsByPipeline,
  getTokenWithCredentials,
  configureZohoCRM,
  disconnect,
  checkConfiguration,
  getPipelines,
  archiveEmail,
  syncAllLeads,
  getZohoConfigById,
  getAllZohoConfigs
} = require("../controllers/zoho");
const zohoService = require('../services/zoho.service');
const ZohoConfig = require('../models/ZohoConfig');
const { zohoTokenMiddleware, requireZohoConfig } = require('../middleware/zohoTokenMiddleware');

const router = express.Router();

// Configuration et authentification
router.post('/configure', configureZohoCRM);
router.post('/token', getTokenWithCredentials);
router.post('/disconnect', disconnect);

router.get('/auth', async (req, res) => {
  try {
      const { clientId, clientSecret, redirectUri, authUrl, tokenUrl, apiBaseUrl, scope, redirect_url, state } = req.query;
      
      // Si des paramètres personnalisés sont fournis, créer une configuration personnalisée
      const customConfig = (clientId && clientSecret && redirectUri) ? {
          clientId,
          clientSecret,
          redirectUri,
          authUrl: authUrl || 'https://accounts.zoho.com/oauth/v2/auth',
          tokenUrl: tokenUrl || 'https://accounts.zoho.com/oauth/v2/token',
          apiBaseUrl: apiBaseUrl || 'https://www.zohoapis.com/crm/v2.1',
          scope: scope || 'ZohoCRM.modules.ALL',
      } : null;

      let generatedAuthUrl = await zohoService.getAuthUrl(customConfig);
      
      // Encoder le redirect_url dans le paramètre state
      // Format: userId|redirect_url_encoded
      if (redirect_url && state) {
          const stateWithRedirect = `${state}|${Buffer.from(redirect_url).toString('base64')}`;
          const url = new URL(generatedAuthUrl);
          url.searchParams.set('state', stateWithRedirect);
          generatedAuthUrl = url.toString();
          console.log('💾 Encoded redirect_url in state parameter:', redirect_url);
      }
      
      res.json({ authUrl: generatedAuthUrl });
  } catch (error) {
      res.status(500).json({ error: error.message });
  }
});

// Handle OAuth callback
router.get('/callback', async (req, res) => {
  try {
      const { code, clientId, clientSecret, redirectUri, authUrl, tokenUrl, apiBaseUrl, scope } = req.query;
      if (!code) {
          return res.status(400).json({ error: 'Authorization code is required' });
      }

      // Si des paramètres personnalisés sont fournis, créer une configuration personnalisée
      const customConfig = (clientId && clientSecret && redirectUri) ? {
          clientId,
          clientSecret,
          redirectUri,
          authUrl: authUrl || 'https://accounts.zoho.com/oauth/v2/auth',
          tokenUrl: tokenUrl || 'https://accounts.zoho.com/oauth/v2/token',
          apiBaseUrl: apiBaseUrl || 'https://www.zohoapis.com/crm/v2.1',
          scope: scope || 'ZohoCRM.modules.ALL'
      } : null;

      const tokenData = await zohoService.getAccessToken(code, customConfig);
      res.json({ 
          message: 'Successfully authenticated with Zoho',
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token
      });
  } catch (error) {
      res.status(500).json({ error: error.message });
  }
});

router.get('/auth/callback', async (req, res) => {
  try {
    const { code, state, userId } = req.query;
    
    // Check if code is present
    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    // Décoder le state pour extraire userId et redirect_url
    // Format: userId|redirect_url_encoded
    let finalUserId = state || userId;
    let redirectUrl = null;
    
    if (state && typeof state === 'string' && state.includes('|')) {
      const parts = state.split('|');
      finalUserId = parts[0];
      if (parts[1]) {
        try {
          redirectUrl = Buffer.from(parts[1], 'base64').toString('utf-8');
          console.log('🔓 Decoded redirect_url from state:', redirectUrl);
        } catch (decodeError) {
          console.error('Error decoding redirect_url:', decodeError);
        }
      }
    }

    // Check if we have a valid userId
    if (!finalUserId || finalUserId.trim() === '') {
      return res.status(400).json({ 
        error: 'User ID is required and cannot be empty',
        details: 'The state parameter or userId must contain a valid user ID'
      });
    }

    const tokenData = await zohoService.getAccessToken(code);

    await ZohoConfig.findOneAndUpdate(
      { userId: finalUserId },
      {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_in,
        updated_at: new Date(),
      },
      { upsert: true }
    );

    // Déterminer l'URL de redirection
    // 1. Si redirect_url a été décodé du state, l'utiliser
    // 2. Sinon, rediriger vers app11 par défaut
    const finalRedirectUrl = redirectUrl || 'https://v25.harx.ai/app11?session=someGeneratedSessionId';
    
    // Ajouter les paramètres de callback
    const url = new URL(finalRedirectUrl);
    url.searchParams.set('code', code);
    url.searchParams.set('state', finalUserId);
    
    console.log('🔙 Redirecting to:', url.toString());
    return res.redirect(url.toString());
  } catch (error) {
    console.error('Error in /auth/callback:', error);
    res.status(500).json({ error: error.message });
  }
});


router.post('/refresh-token', async (req, res) => {
  try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
          return res.status(400).json({ error: 'Refresh token is required' });
      }

      const tokenData = await zohoService.refreshToken(refreshToken);
      res.json({ 
          message: 'Token refreshed successfully',
          accessToken: tokenData.access_token
      });
  } catch (error) {
      res.status(500).json({ error: error.message });
  }
});

// Leads et Deals - avec middleware de refresh automatique
router.get('/leads', zohoTokenMiddleware, requireZohoConfig, getLeads);
router.post('/leads', zohoTokenMiddleware, requireZohoConfig, saveLeads);
router.put('/leads/:id', zohoTokenMiddleware, requireZohoConfig, updateLead);
router.post('/leads/sync-all', zohoTokenMiddleware, requireZohoConfig, syncAllLeads);
router.get('/deals', zohoTokenMiddleware, requireZohoConfig, getDeals);
router.get('/deals/count', zohoTokenMiddleware, requireZohoConfig, getDealsCount);
router.get('/leads-by-pipeline', zohoTokenMiddleware, requireZohoConfig, getLeadsByPipeline);

// Contacts - avec middleware de refresh automatique
router.get('/contacts', zohoTokenMiddleware, requireZohoConfig, getContacts);

// Chats - avec middleware de refresh automatique
router.get('/chats', zohoTokenMiddleware, requireZohoConfig, getChats);
router.get('/chats/:id/messages', zohoTokenMiddleware, requireZohoConfig, getCoversationMessages);
router.post('/chats/:id/messages', zohoTokenMiddleware, requireZohoConfig, sendMessageToConversation);

// Emails - avec middleware de refresh automatique
router.get('/folders', zohoTokenMiddleware, requireZohoConfig, getFolders);
router.get('/emails/sent', zohoTokenMiddleware, requireZohoConfig, getSentEmails);
router.get('/emails/inbox', zohoTokenMiddleware, requireZohoConfig, getInboxEmails);
router.get('/emails/archived', zohoTokenMiddleware, requireZohoConfig, getArchivedEmails);
router.post('/emails/:id/archive', zohoTokenMiddleware, requireZohoConfig, archiveEmail);

// Configuration et pipelines - avec middleware de refresh automatique
router.get('/check-configuration', zohoTokenMiddleware, requireZohoConfig, checkConfiguration);
router.get('/pipelines', zohoTokenMiddleware, requireZohoConfig, getPipelines);

router.get('/config/:id', getZohoConfigById);
router.get('/configs', getAllZohoConfigs);

router.get('/config/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const config = await ZohoConfig.findOne({ userId });
    if (!config) {
      return res.status(404).json({ error: 'Configuration not found for this user' });
    }
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/config/user/:userId/refresh-token', async (req, res) => {
  try {
    const { userId } = req.params;
    const config = await ZohoConfig.findOne({ userId });
    
    if (!config) {
      return res.status(404).json({ error: 'Configuration not found for this user' });
    }

    if (!config.refresh_token) {
      return res.status(400).json({ error: 'No refresh token found for this user' });
    }

    const tokenData = await zohoService.refreshToken(config.refresh_token);

    // Update the configuration with new tokens
    await ZohoConfig.findOneAndUpdate(
      { userId },
      {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_in,
        updated_at: new Date(),
      }
    );

    res.json({
      message: 'Token refreshed successfully',
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
