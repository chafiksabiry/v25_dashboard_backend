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

const router = express.Router();

const zohoSchema = new mongoose.Schema({
  clientId: {
    type: String,
    required: true
  },
  clientSecret: {
    type: String,
    required: true
  },
  refreshToken: {
    type: String,
    required: true
  }
}, { timestamps: true });

const ZohoIntegration = mongoose.model('ZohoIntegration', zohoSchema);

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

module.exports = router;
