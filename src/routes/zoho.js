require("dotenv").config();
const express = require("express");
const axios = require("axios");
const {
  redirectToZoho,
  zohoCallback,
  refreshToken,
  getLeads,
  saveLeads,
} = require("../controllers/zoho");

const router = express.Router();

router.get("/auth", redirectToZoho);
router.get("/auth/callback", zohoCallback);
router.get("/refresh-token", refreshToken);
router.get("/leads", getLeads);
router.post("/leads/save", saveLeads);

// Récupérer les chats depuis Zoho SalesIQ
router.get("/chats", async (req, res) => {
  const url = `https://salesiq.zoho.com/api/v1/${process.env.ZOHO_SALESIQ_PORTAL}/chats`;
  
  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${process.env.ZOHO_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    res.json(response.data);
  } catch (error) {
    console.error("Erreur lors de la récupération des chats :", error?.response?.data || error.message);
    res.status(error?.response?.status || 500).json({
      error: "Échec de la récupération des chats",
      details: error?.response?.data || error.message,
    });
  }
});

// Récupérer le transcript d'un chat
router.get("/chats/:chat_id/transcript", async (req, res) => {
  const { chat_id } = req.params;
  const url = `https://salesiq.zoho.com/api/v1/${process.env.ZOHO_SALESIQ_PORTAL}/chats/${chat_id}/transcript`;

  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${process.env.ZOHO_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    res.json(response.data);
  } catch (error) {
    console.error("Erreur lors de la récupération du transcript :", error?.response?.data || error.message);
    res.status(error?.response?.status || 500).json({
      error: "Échec de la récupération du transcript",
      details: error?.response?.data || error.message,
    });
  }
});

module.exports = router;
