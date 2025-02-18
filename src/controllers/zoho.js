// controllers/zohoController.js
const axios = require("axios");
const { config } = require("../config/env");
const { Lead } = require("../models/Lead");

// Redirection vers Zoho pour l'authentification
const redirectToZoho = (req, res) => {
  const authURL = `${config.ZOHO_AUTH_URL}?response_type=code&client_id=${config.ZOHO_CLIENT_ID}&scope=${config.ZOHO_SCOPE}&redirect_uri=${config.ZOHO_REDIRECT_URI}&access_type=offline`;
  res.redirect(authURL);
};

// Callback après la connexion Zoho
const zohoCallback = async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send("Code d'authentification manquant");

  try {
    const response = await axios.post(config.ZOHO_TOKEN_URL, null, {
      params: {
        code,
        client_id: config.ZOHO_CLIENT_ID,
        client_secret: config.ZOHO_CLIENT_SECRET,
        redirect_uri: config.ZOHO_REDIRECT_URI,
        grant_type: "authorization_code",
      },
    });

    const accessToken = response.data.access_token;
    const refreshToken = response.data.refresh_token;

    // Stockage temporaire (à remplacer par un stockage sécurisé en production)
    req.app.locals.refreshToken = refreshToken;

    const redirectURL = `${config.REACT_APP_URL}/leads?token=${accessToken}`;
    res.redirect(redirectURL);
  } catch (error) {
    console.error(
      "Erreur lors de la récupération du token:",
      error.response?.data || error.message
    );
    res.status(500).send("Erreur d'authentification");
  }
};

// Rafraîchir le token
const refreshToken = async (req, res) => {
  try {
    const refreshToken = req.app.locals.refreshToken;
    if (!refreshToken) {
      return res
        .status(401)
        .json({ message: "Aucun refresh token disponible" });
    }

    const response = await axios.post(config.ZOHO_TOKEN_URL, null, {
      params: {
        refresh_token: refreshToken,
        client_id: config.ZOHO_CLIENT_ID,
        client_secret: config.ZOHO_CLIENT_SECRET,
        grant_type: "refresh_token",
      },
    });

    const newAccessToken = response.data.access_token;
    res.json({ accessToken: newAccessToken });
  } catch (error) {
    console.error("Erreur lors du rafraîchissement du token:", error);
    res
      .status(500)
      .json({ message: "Erreur lors du rafraîchissement du token" });
  }
};

// Récupérer les leads
const getLeads = async (req, res) => {
    const accessToken = req.headers.authorization?.split(" ")[1];
    if (!accessToken) {
      return res.status(401).json({
        message: "Non authentifié",
        loginURL: `${config.BACKEND_URL}/api/zoho/auth`,
      });
    }
  
    try {
      const response = await axios.get(config.ZOHO_API_URL, {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
      });
  
      const leads = response.data.data;
      
      // Sauvegarde automatique des leads dans MongoDB
      await axios.post(`${config.BACKEND_URL}/api/zoho/leads/save`, { leads });
  
      res.json(leads);
    } catch (error) {
      console.error(
        "Erreur lors de la récupération des leads:",
        error.response?.data || error.message
      );
  
      if (error.response?.data?.code === "INVALID_TOKEN") {
        return res.status(401).json({
          message: "Token invalide. Redirection vers la connexion Zoho.",
          loginURL: `${config.BACKEND_URL}/api/zoho/auth`,
        });
      }
  
      res.status(500).json({
        message: "Erreur lors de la récupération des leads",
      });
    }
  };
  

// Ajouter cette fonction pour stocker les leads dans MongoDB
const saveLeads = async (req, res) => {
    try {
      const leads = req.body.leads;
      if (!leads || !Array.isArray(leads)) {
        return res.status(400).json({ message: "Aucun lead à sauvegarder." });
      }
  
      // Boucle pour enregistrer chaque lead dans MongoDB
      const savedLeads = await Promise.all(
        leads.map(async (lead) => {
          const newLead = new Lead({
            name: lead.Full_Name,
            company: lead.Company,
            email: lead.Email,
            phone: lead.Phone,
            status: lead.Status || 'new',
            source: 'Zoho CRM', // Pour savoir d'où viennent les leads
          });
          return await newLead.save();
        })
      );
  
      res.status(201).json({ success: true, data: savedLeads });
    } catch (error) {
      console.error("Erreur lors de la sauvegarde des leads:", error);
      res.status(500).json({ message: "Erreur lors de la sauvegarde des leads" });
    }
  };
  

module.exports = {
  redirectToZoho,
  zohoCallback,
  refreshToken,
  getLeads,
  saveLeads,
};
