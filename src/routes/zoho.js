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
      const authUrl = await zohoService.getAuthUrl();
      res.json({ authUrl });
  } catch (error) {
      res.status(500).json({ error: error.message });
  }
});

// Handle OAuth callback
router.get('/callback', async (req, res) => {
  try {
      const { code } = req.query;
      if (!code) {
          return res.status(400).json({ error: 'Authorization code is required' });
      }

      const tokenData = await zohoService.getAccessToken(code);
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
      const { code, userId, state } = req.query;
      
      // Si nous n'avons pas d'userId, nous redirigeons vers la page de configuration avec le code
      if (!userId && !state) {
          return res.redirect(`https://v25.harx.ai/app11?code=${code}`);
      }

      const finalUserId = userId || state;
      if (!code) {
          return res.status(400).json({ error: 'Authorization code is required' });
      }

      const tokenData = await zohoService.getAccessToken(code);

      // Vérification des champs requis
      if (!tokenData.access_token || !tokenData.refresh_token || !tokenData.expires_in) {
          console.error('Token data missing required fields:', tokenData);
          return res.status(500).json({ 
              error: 'Invalid token data received from Zoho',
              details: 'Missing required fields in token response'
          });
      }

      // Création de la config à enregistrer
      const config = new ZohoConfig({
        userId: finalUserId,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_in,
        updated_at: new Date()
      });

      try {
          await config.save();
      } catch (saveError) {
          console.error('Error saving ZohoConfig:', saveError);
          return res.status(500).json({ 
              error: 'Failed to save Zoho configuration',
              details: saveError.message
          });
      }

      return res.redirect(`https://v25.harx.ai/app11?accessToken=${tokenData.access_token}&refreshToken=${tokenData.refresh_token}`);
  } catch (error) {
      console.error('Error in auth callback:', error);
      res.status(500).json({ 
          error: 'Error handling OAuth callback',
          details: error.message
      });
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
