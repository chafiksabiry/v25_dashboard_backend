const axios = require("axios");
const { config } = require("../config/env");
const { Lead } = require("../models/Lead");

const redirectToZoho = (req, res) => {
  console.log("Redirection vers Zoho pour l'authentification...");
  const authURL = `${config.ZOHO_AUTH_URL}?response_type=code&client_id=${config.ZOHO_CLIENT_ID}&scope=${config.ZOHO_SCOPE}&redirect_uri=${config.ZOHO_REDIRECT_URI}&access_type=offline`;
  res.redirect(authURL);
};

const zohoCallback = async (req, res) => {
  console.log("Callback reçu avec query params:", req.query);
  const { code } = req.query;
  if (!code) return res.status(400).send("Code d'authentification manquant");

  try {
    console.log("Échange du code d'authentification contre un token...");
    const response = await axios.post(config.ZOHO_TOKEN_URL, null, {
      params: {
        code,
        client_id: config.ZOHO_CLIENT_ID,
        client_secret: config.ZOHO_CLIENT_SECRET,
        redirect_uri: config.ZOHO_REDIRECT_URI,
        grant_type: "authorization_code",
      },
    });

    console.log("Token reçu:", response.data);
    const accessToken = response.data.access_token;
    const refreshToken = response.data.refresh_token;

    req.app.locals.refreshToken = refreshToken;

    const redirectURL = `${config.REACT_APP_URL}/leads?token=${accessToken}`;
    console.log("Redirection vers:", redirectURL);
    res.redirect(redirectURL);
  } catch (error) {
    console.error(
      "Erreur lors de la récupération du token:",
      error.response?.data || error.message
    );
    res.status(500).send("Erreur d'authentification");
  }
};

const refreshToken = async (req, res) => {
  console.log("Tentative de rafraîchissement du token...");
  try {
    const refreshToken = req.app.locals.refreshToken;
    if (!refreshToken) {
      console.log("Aucun refresh token disponible");
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

    console.log("Nouveau token obtenu:", response.data);
    const newAccessToken = response.data.access_token;
    res.json({ accessToken: newAccessToken });
  } catch (error) {
    console.error("Erreur lors du rafraîchissement du token:", error);
    res
      .status(500)
      .json({ message: "Erreur lors du rafraîchissement du token" });
  }
};

const getLeads = async (req, res) => {
  console.log("Récupération des leads depuis Zoho...");
  const accessToken = req.headers.authorization?.split(" ")[1];
  if (!accessToken) {
    console.log("Non authentifié. Redirection vers la connexion Zoho.");
    return res.status(401).json({
      message: "Non authentifié",
      loginURL: `${config.BACKEND_URL}/api/zoho/auth`,
    });
  }

  try {
    const response = await axios.get(config.ZOHO_API_URL, {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    });

    console.log("Leads récupérés:", response.data);

    // Enregistrement des leads dans MongoDB
    const savedLeads = await Promise.all(
      response.data.data.map(async (lead) => {
        const existingLead = await Lead.findOne({ email: lead.Email });
        if (existingLead) {
          console.log("Lead déjà existant, mise à jour:", lead.Email);
          existingLead.name = lead.Full_Name;
          existingLead.company = lead.Company;
          existingLead.phone = lead.Phone;
          existingLead.status = lead.Status || "new";
          return await existingLead.save();
        } else {
          console.log("Nouveau lead, enregistrement:", lead.Email);
          const newLead = new Lead({
            name: lead.Full_Name,
            company: lead.Company,
            email: lead.Email,
            phone: lead.Phone,
            status: lead.Status || "new",
            source: "Zoho CRM",
          });
          return await newLead.save();
        }
      })
    );

    res.json({ success: true, data: savedLeads });
  } catch (error) {
    console.error(
      "Erreur lors de la récupération des leads:",
      error.response?.data || error.message
    );

    if (error.response?.data?.code === "INVALID_TOKEN") {
      console.log("Token invalide. Redirection vers la connexion Zoho.");
      return res.status(401).json({
        message: "Token invalide. Redirection vers la connexion Zoho.",
        loginURL: `${config.BACKEND_URL}/api/zoho/auth`,
      });
    }

    res
      .status(500)
      .json({ message: "Erreur lors de la récupération des leads" });
  }
};

const saveLeads = async (req, res) => {
  console.log("Sauvegarde des leads...");
  try {
    const leads = req.body.leads;
    if (!leads || !Array.isArray(leads)) {
      console.log("Aucun lead à sauvegarder.");
      return res.status(400).json({ message: "Aucun lead à sauvegarder." });
    }

    const savedLeads = await Promise.all(
      leads.map(async (lead) => {
        console.log("Sauvegarde du lead:", lead);
        const newLead = new Lead({
          name: lead.Full_Name,
          company: lead.Company,
          email: lead.Email,
          phone: lead.Phone,
          status: lead.Status || "new",
          source: "Zoho CRM",
        });
        return await newLead.save();
      })
    );

    console.log("Leads sauvegardés:", savedLeads);
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
