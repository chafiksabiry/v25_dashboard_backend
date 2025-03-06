const axios = require("axios");
const { config } = require("../config/env");
const { Lead } = require("../models/Lead");

const redirectToZoho = (req, res) => {
  console.log("Redirection vers Zoho pour l'authentification...");

  const entity = req.query.entity || "leads"; // Récupération de l'entité depuis la requête
  const validEntities = ["leads", "deals", "contacts"];
  const state = validEntities.includes(entity) ? entity : "leads"; // Vérification de l'entité

  const authURL = `${config.ZOHO_AUTH_URL}?response_type=code&client_id=${config.ZOHO_CLIENT_ID}&scope=${config.ZOHO_SCOPE}&redirect_uri=${config.ZOHO_REDIRECT_URI}&access_type=offline&state=${state}`;

  console.log("URL d'authentification Zoho:", authURL);
  res.redirect(authURL);
};

const zohoCallback = async (req, res) => {
  console.log("Callback reçu avec query params:", req.query);
  const { code, state } = req.query;

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

    // Vérifier et valider `state`
    const validEntities = ["leads", "deals", "contacts"];
    const entity = validEntities.includes(state) ? state : "leads"; // Valeur par défaut si invalide

    const redirectURL = `${config.REACT_APP_URL}/${entity}?token=${accessToken}`;
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

const refreshToken = async () => {
  try {
    const refreshToken = req.app.locals.refreshToken;
    if (!refreshToken) {
      throw new Error("Aucun refresh token disponible");
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
    req.app.locals.accessToken = newAccessToken;
    return newAccessToken;
  } catch (error) {
    console.error(
      "Erreur lors du rafraîchissement du token:",
      error.response?.data || error.message
    );
    return null;
  }
};

const getChats = async (req, res) => {
  console.log("Récupération des chats depuis Zoho...");

  const accessToken = req.headers.authorization?.split(" ")[1];

  if (!accessToken) {
    console.log("Non authentifié. Redirection vers la connexion Zoho.");
    return res.status(401).json({
      message: "Non authentifié",
      loginURL: `${config.BACKEND_URL}/api/zoho/auth/callback`,
    });
  }

  try {
    const response = await axios.get(`https://salesiq.zoho.com/api/v1/harxtechnologiesinc/chats`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    console.log("Chats récupérés:", response.data);
    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error(
      "Erreur lors de la récupération des chats:",
      error.response?.data || error.message
    );

    if (error.response?.data?.code === "INVALID_TOKEN") {
      console.log("Token invalide. Demande d'une nouvelle authentification.");
      return res.status(401).json({
        message: "Token invalide. Redirection vers la connexion Zoho.",
        loginURL: `${config.BACKEND_URL}/api/zoho/auth/callback`,
      });
    }

    res
      .status(500)
      .json({ message: "Erreur lors de la récupération des chats" });
  }
};

const getChatTranscript = async (req, res) => {
  console.log("Récupération de la transcription du chat depuis Zoho...");

  const accessToken = req.headers.authorization?.split(" ")[1];
  const { chat_id } = req.params;

  if (!accessToken) {
    console.log("Non authentifié. Redirection vers la connexion Zoho.");
    return res.status(401).json({
      message: "Non authentifié",
      loginURL: `${config.BACKEND_URL}/api/zoho/auth/callback`,
    });
  }

  if (!chat_id) {
    return res.status(400).json({ message: "chat_id est requis" });
  }

  try {
    const response = await axios.get(
      `https://salesiq.zoho.com/api/v1/harxtechnologiesinc/chats/${chat_id}/Transcript`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    console.log("Transcription récupérée:", response.data);
    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error(
      "Erreur lors de la récupération de la transcription:",
      error.response?.data || error.message
    );

    if (error.response?.data?.code === "INVALID_TOKEN") {
      console.log("Token invalide. Demande d'une nouvelle authentification.");
      return res.status(401).json({
        message: "Token invalide. Redirection vers la connexion Zoho.",
        loginURL: `${config.BACKEND_URL}/api/zoho/auth/callback`,
      });
    }

    res
      .status(500)
      .json({ message: "Erreur lors de la récupération de la transcription" });
  }
};

const getDeals = async (req, res) => {
  console.log("Récupération des deals depuis Zoho...");

  const accessToken = req.headers.authorization?.split(" ")[1];

  if (!accessToken) {
    console.log("Non authentifié. Redirection vers la connexion Zoho.");
    return res.status(401).json({
      message: "Non authentifié",
      loginURL: `${config.BACKEND_URL}/api/zoho/auth/callback`,
    });
  }

  try {
    const response = await axios.get(`${config.ZOHO_API_URL}/Deals`, {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    });

    console.log("Deals récupérés:", response.data);
    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error(
      "Erreur lors de la récupération des deals:",
      error.response?.data || error.message
    );

    if (error.response?.data?.code === "INVALID_TOKEN") {
      console.log("Token invalide. Redirection vers l'authentification.");
      return res.status(401).json({
        message: "Token invalide. Veuillez vous reconnecter.",
        loginURL: `${config.BACKEND_URL}/api/zoho/auth/callback`,
      });
    }

    res
      .status(500)
      .json({ message: "Erreur lors de la récupération des deals" });
  }
};

const getLeads = async (req, res) => {
  console.log("Récupération des leads depuis Zoho...");

  let accessToken = req.headers.authorization?.split(" ")[1];
  if (!accessToken) {
    console.log("Aucun accessToken. Tentative de rafraîchissement...");
    accessToken = await refreshToken();
    if (!accessToken) {
      return res.status(401).json({
        message: "Non authentifié. Veuillez vous reconnecter.",
        loginURL: `${config.BACKEND_URL}/api/zoho/auth/callback`,
      });
    }
  }

  try {
    const response = await axios.get(`${config.ZOHO_API_URL}/Leads`, {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    });

    console.log("Leads récupérés:", response.data);
    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error(
      "Erreur lors de la récupération des leads:",
      error.response?.data || error.message
    );

    if (error.response?.data?.code === "INVALID_TOKEN") {
      console.log("Token invalide. Tentative de rafraîchissement...");
      accessToken = await refreshToken();
      if (accessToken) {
        return getLeads(req, res); // Refaire la requête avec le nouveau token
      }
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

const getDealsCount = async (req, res) => {
  console.log("Récupération du nombre de deals depuis Zoho...");

  const accessToken = req.headers.authorization?.split(" ")[1];

  if (!accessToken) {
    console.log("Non authentifié. Redirection vers la connexion Zoho.");
    return res.status(401).json({
      message: "Non authentifié",
      loginURL: `${config.BACKEND_URL}/api/zoho/auth/callback`,
    });
  }

  const pageSize = 200;
  const batchLimit = 10; // Nombre de pages par lot avant d'attendre
  let allDeals = [];
  let totalDeals = 0;

  try {
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const batchPromises = [];
      for (let i = 0; i < batchLimit; i++) {
        batchPromises.push(
          axios.get("https://www.zohoapis.com/crm/v2/Deals", {
            headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
            params: { page: page++, per_page: pageSize },
          })
        );
      }

      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach((result) => {
        allDeals = allDeals.concat(result.data.data);
      });

      hasMore = batchResults[batchResults.length - 1].data.info.more_records;

      // Attendre un certain délai pour respecter les limites d'API de Zoho
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Attendre 5 secondes entre chaque lot de requêtes
    }

    totalDeals = allDeals.length;
    console.log("Nombre total de deals récupérés:", totalDeals);
    res.json({ success: true, count: totalDeals, deals: allDeals });
  } catch (error) {
    console.error(
      "Erreur lors de la récupération des deals:",
      error.response?.data || error.message
    );
    res
      .status(500)
      .json({ message: "Erreur lors de la récupération des deals" });
  }
};

const getContacts = async (req, res) => {
  console.log("Récupération des contacts depuis Zoho...");

  const accessToken = req.headers.authorization?.split(" ")[1];

  if (!accessToken) {
    console.log("Non authentifié. Redirection vers la connexion Zoho.");
    return res.status(401).json({
      message: "Non authentifié",
      loginURL: `${config.BACKEND_URL}/api/zoho/auth/callback`,
    });
  }

  try {
    const response = await axios.get(`${config.ZOHO_API_URL}/Contacts`, {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    });

    console.log("Contacts récupérés:", response.data);
    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error(
      "Erreur lors de la récupération des contacts:",
      error.response?.data || error.message
    );

    if (error.response?.data?.code === "INVALID_TOKEN") {
      console.log("Token invalide. Redirection vers l'authentification.");
      return res.status(401).json({
        message: "Token invalide. Veuillez vous reconnecter.",
        loginURL: `${config.BACKEND_URL}/api/zoho/auth/callback`,
      });
    }

    res
      .status(500)
      .json({ message: "Erreur lors de la récupération des contacts" });
  }
};


module.exports = {
  redirectToZoho,
  zohoCallback,
  refreshToken,
  getLeads,
  saveLeads,
  getDeals,
  getContacts,
  getDealsCount,
  getChats,
  getChatTranscript,
};
