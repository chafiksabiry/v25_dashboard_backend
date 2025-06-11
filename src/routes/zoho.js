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

const router = express.Router();

// Configuration et authentification
router.post('/configure', configureZohoCRM);
router.post('/token', getTokenWithCredentials);
router.post('/disconnect', disconnect);

router.get('/auth', async (req, res) => {
  try {
      const { clientId, clientSecret, redirectUri, authUrl, tokenUrl, apiBaseUrl, scope } = req.query;
      
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

      const generatedAuthUrl = await zohoService.getAuthUrl(customConfig);
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

    // Use either state or userId, with state taking precedence
    const finalUserId = state || userId;

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

    // Redirect to the frontend with the session
    return res.redirect(`https://v25.harx.ai/app11?session=someGeneratedSessionId`);
  } catch (error) {
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

// Leads et Deals
router.get('/leads', getLeads);
router.post('/leads', saveLeads);
router.put('/leads/:id', updateLead);
router.post('/leads/sync-all', syncAllLeads);
router.get('/deals', getDeals);
router.get('/deals/count', getDealsCount);
router.get('/leads-by-pipeline', getLeadsByPipeline);

// Contacts
router.get('/contacts', getContacts);

// Chats
router.get('/chats', getChats);
router.get('/chats/:id/messages', getCoversationMessages);
router.post('/chats/:id/messages', sendMessageToConversation);


// Emails
router.get('/folders', getFolders);
router.get('/emails/sent', getSentEmails);
router.get('/emails/inbox', getInboxEmails);
router.get('/emails/archived', getArchivedEmails);
router.post('/emails/:id/archive', archiveEmail);

router.get('/check-configuration', checkConfiguration);

router.get('/pipelines', getPipelines);

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

module.exports = router;
