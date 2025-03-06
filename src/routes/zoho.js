require("dotenv").config();
const express = require("express");
const axios = require("axios");
const {
  redirectToZoho,
  zohoCallback,
  refreshToken,
  getLeads,
  saveLeads,
  getDeals,
  getContacts,
  getDealsCount,
  getChats,
  getChatTranscript
} = require("../controllers/zoho");

const router = express.Router();

router.get("/auth", redirectToZoho);
router.get("/auth/callback", zohoCallback);
router.get("/refresh-token", refreshToken);
router.get("/leads", getLeads);
router.post("/leads/save", saveLeads);

async function refreshAccessToken() {
  try {
    const response = await axios.post(
      "https://accounts.zoho.com/oauth/v2/token",
      null,
      {
        params: {
          refresh_token: process.env.ZOHO_REFRESH_TOKEN,
          client_id: process.env.ZOHO_CLIENT_ID,
          client_secret: process.env.ZOHO_CLIENT_SECRET,
          grant_type: "refresh_token",
        },
      }
    );

    // Mettre à jour l'access token dans l'environnement (ou base de données)
    process.env.ZOHO_ACCESS_TOKEN = response.data.access_token;

    return response.data.access_token;
  } catch (error) {
    console.error(
      "Erreur lors du rafraîchissement de l'access token:",
      error?.response?.data || error.message
    );
    throw new Error("Échec du rafraîchissement de l'access token");
  }
}

// Rafraîchir l'access token si nécessaire
async function getValidAccessToken() {
  if (!process.env.ZOHO_ACCESS_TOKEN) {
    await refreshAccessToken(); // Rafraîchit l'access token si nécessaire
  }
  return process.env.ZOHO_ACCESS_TOKEN;
}

// Récupérer les chats depuis Zoho SalesIQ
router.get("/chats", getChats);

// Récupérer le transcript d'un chat
router.get("/chats/:chat_id/transcript", getChatTranscript);

router.post("/chats/:chat_id/send", async (req, res) => {
  const { chat_id } = req.params;
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Le message ne peut pas être vide." });
  }

  try {
    const accessToken = await getValidAccessToken();
    const url = `https://salesiq.zoho.com/api/v1/${process.env.ZOHO_SALESIQ_PORTAL}/chats/${chat_id}/messages`;

    const response = await axios.post(
      url,
      { message },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error(
      "Erreur lors de l'envoi du message :",
      error?.response?.data || error.message
    );
    res.status(error?.response?.status || 500).json({
      error: "Échec de l'envoi du message",
      details: error?.response?.data || error.message,
    });
  }
});

// Récupérer les deals
router.get("/deals", getDeals);
router.get("/deals/count", getDealsCount);

// Récupérer les contacts
router.get("/contacts", getContacts);

module.exports = router;
