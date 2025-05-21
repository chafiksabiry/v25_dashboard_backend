const axios = require("axios");
const { config } = require("../config/env");
const LeadModel = require("../models/Lead");
const ZohoConfig = require("../models/ZohoConfig");
const mongoose = require("mongoose");

const refreshToken = async (app) => {
  if (!app || !app.locals) {
    console.error("App non définie ou app.locals inaccessible");
    return null;
  }

  try {
    // Récupérer la configuration depuis la base de données
    const zohoConfig = await ZohoConfig.findOne().sort({ lastUpdated: -1 });

    if (!zohoConfig) {
      console.error("Configuration Zoho non trouvée dans la base de données");
      throw new Error("Configuration Zoho CRM requise");
    }

    console.log("Rafraîchissement du token en cours...");
    console.log("URL:", config.ZOHO_TOKEN_URL);
    console.log("Paramètres:", {
      refresh_token: zohoConfig.refreshToken.substring(0, 10) + "...",
      client_id: zohoConfig.clientId.substring(0, 10) + "...",
      client_secret: zohoConfig.clientSecret.substring(0, 10) + "...",
      grant_type: "refresh_token",
    });

    const response = await axios.post(config.ZOHO_TOKEN_URL, null, {
      params: {
        refresh_token: zohoConfig.refreshToken,
        client_id: zohoConfig.clientId,
        client_secret: zohoConfig.clientSecret,
        grant_type: "refresh_token",
      },
    });

    if (!response.data.access_token) {
      console.error("Réponse de rafraîchissement invalide:", response.data);
      throw new Error("Token non reçu dans la réponse");
    }

    const newAccessToken = response.data.access_token;
    console.log("Nouveau token rafraîchi obtenu");
    return newAccessToken;
  } catch (error) {
    console.error(
      "Erreur détaillée lors du rafraîchissement du token:",
      {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message
      }
    );

    // Gestion spécifique des erreurs
    if (error.response?.status === 400) {
      if (error.response?.data?.error === "invalid_grant") {
        throw new Error("Refresh token invalide ou expiré. Veuillez reconfigurer l'intégration Zoho.");
      } else if (error.response?.data?.error === "invalid_client") {
        throw new Error("Identifiants client invalides. Veuillez vérifier votre configuration Zoho.");
      }
    }

    throw new Error(`Échec du rafraîchissement du token: ${error.response?.data?.error || error.message}`);
  }
};

const checkAuth = (req) => {
  if (!req.headers.authorization) {
    throw new Error("Token d'accès requis dans les headers");
  }

  // Vérifier que le token est au bon format
  const token = req.headers.authorization.split(" ")[1];
  if (!token) {
    throw new Error("Format du token invalide");
  }
};

const executeWithTokenRefresh = async (req, res, apiCall) => {
  try {
    let accessToken = req.headers.authorization?.split(" ")[1];

    if (!accessToken || accessToken.startsWith("temp_")) {
      console.log(
        "Token temporaire détecté, recherche de la configuration dans la base de données..."
      );

      // Récupérer la configuration depuis la base de données
      const zohoConfig = await ZohoConfig.findOne().sort({ lastUpdated: -1 });

      if (!zohoConfig) {
        console.error(
          "Aucune configuration Zoho trouvée dans la base de données"
        );
        throw new Error("Configuration_Required");
      }

      // Mettre à jour app.locals avec les informations de la base de données
      req.app.locals.refreshToken = zohoConfig.refreshToken;
      req.app.locals.clientId = zohoConfig.clientId;
      req.app.locals.clientSecret = zohoConfig.clientSecret;

      console.log(
        "Configuration trouvée, tentative de rafraîchissement du token..."
      );
      accessToken = await refreshToken(req.app);

      if (!accessToken) {
        throw new Error("Token_Refresh_Failed");
      }
    }

    console.log("Tentative d'appel API avec le token");
    try {
      const result = await apiCall(accessToken);
      return { success: true, data: result };
    } catch (error) {
      if (
        error.response?.status === 401 ||
        error.response?.data?.code === "INVALID_TOKEN"
      ) {
        console.log("Token invalide, nouveau rafraîchissement...");
        accessToken = await refreshToken(req.app);
        if (!accessToken) {
          throw new Error("Token_Refresh_Failed");
        }
        const result = await apiCall(accessToken);
        return { success: true, data: result };
      }
      throw error;
    }
  } catch (error) {
    console.error("Erreur dans executeWithTokenRefresh:", {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    throw error;
  }
};

// Modifier la fonction getSalesIQPortalName
const getSalesIQPortalName = async (token) => {
  console.log("Tentative de récupération du portal name avec token:", token.substring(0, 10) + "...");

  const response = await axios.get("https://salesiq.zoho.com/api/v2/portals", {
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
    },
  });

  console.log("Réponse SalesIQ organizations:", response.data);

  if (response.data && response.data.data && response.data.data.length > 0) {
    const portalName = response.data.data[0].screenname;
    console.log("Portal name trouvé:", portalName);
    return portalName;
  }

  throw new Error("Aucune organisation SalesIQ trouvée");
};

// Modifier la fonction getChats
const getChats = async (req, res) => {
  console.log("Début de getChats");
  try {
    checkAuth(req);

    const data = await executeWithTokenRefresh(req, res, async (token) => {
      try {
        console.log("Tentative de récupération des chats avec token:", token.substring(0, 10) + "...");

        // Récupérer le portal name avec gestion d'erreur
        let portalName;
        try {
          portalName = await getSalesIQPortalName(token);
        } catch (portalError) {
          console.error("Erreur lors de la récupération du portal name:", portalError);
          throw new Error(`Erreur SalesIQ: ${portalError.message}`);
        }

        if (!portalName) {
          throw new Error("Portal name non trouvé");
        }

        console.log("Tentative d'appel à l'API conversations avec portal name:", portalName);

        const response = await axios.get(
          `https://salesiq.zoho.com/api/v2/${portalName}/conversations`,
          {
            headers: {
              Authorization: `Zoho-oauthtoken ${token}`,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
          }
        );

        if (response.data.error) {
          console.error("Erreur dans la réponse SalesIQ:", response.data.error);
          throw new Error(`Erreur SalesIQ: ${response.data.error.message}`);
        }

        return response.data;
      } catch (apiError) {
        console.error("Erreur API détaillée:", {
          status: apiError.response?.status,
          statusText: apiError.response?.statusText,
          data: apiError.response?.data,
          message: apiError.message,
        });

        // Gestion spécifique des erreurs SalesIQ
        if (apiError.response?.status === 401) {
          throw new Error("Token non autorisé pour SalesIQ. Veuillez vérifier les scopes du token.");
        } else if (apiError.response?.status === 403) {
          throw new Error("Permissions insuffisantes pour SalesIQ. Veuillez vérifier les autorisations.");
        } else if (apiError.message.includes("SalesIQ")) {
          throw apiError;
        }

        throw new Error(
          apiError.response?.data?.error?.message || "Erreur API SalesIQ"
        );
      }
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error("Erreur complète getChats:", {
      message: error.message,
      stack: error.stack,
      response: error.response?.data,
    });

    // Gestion spécifique des erreurs
    if (error.message.includes("SalesIQ")) {
      return res.status(401).json({
        success: false,
        message: error.message,
        requiresSalesIQConfiguration: true,
      });
    }

    if (error.message === "Configuration_Required") {
      return res.status(401).json({
        success: false,
        message: "Configuration Zoho CRM requise. Veuillez configurer via /api/zoho/configure",
        requiresConfiguration: true,
      });
    }

    if (error.message === "Token_Refresh_Failed") {
      return res.status(401).json({
        success: false,
        message: "Échec du rafraîchissement du token. Veuillez reconfigurer.",
        requiresConfiguration: true,
      });
    }

    res.status(error.response?.status || 500).json({
      success: false,
      message: error.message || "Erreur lors de la récupération des chats",
      details: error.response?.data || "Pas de détails supplémentaires disponibles",
    });
  }
};

const getCoversationMessages = async (req, res) => {
  console.log("Début de getCoversationMessages");
  const { id } = req.params;

  try {
    checkAuth(req);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "ID de conversation requis",
      });
    }

    // Vérifier que l'ID est au bon format
    if (!/^[0-9a-zA-Z]+$/.test(id)) {
      return res.status(400).json({
        success: false,
        message: "Format d'ID de conversation invalide",
      });
    }

    const data = await executeWithTokenRefresh(req, res, async (token) => {
      try {
        // Récupérer le portal name
        const portalName = await getSalesIQPortalName(token);
        console.log("Portal name récupéré:", portalName);

        const response = await axios.get(
          `https://salesiq.zoho.com/api/v2/${portalName}/conversations/${id}/messages`,
          {
            headers: {
              Authorization: `Zoho-oauthtoken ${token}`,
              "Content-Type": "application/json",
            },
          }
        );

        // Log de la réponse pour le débogage
        console.log("Réponse de l'API Zoho:", response.data);

        return response.data;
      } catch (apiError) {
        console.error("Erreur API détaillée:", {
          status: apiError.response?.status,
          data: apiError.response?.data,
          message: apiError.message,
        });

        // Gestion spécifique des erreurs API
        if (apiError.response?.status === 400) {
          throw new Error(
            "ID de conversation invalide ou conversation non trouvée"
          );
        }
        throw apiError;
      }
    });

    res.json({ success: true, data });
  } catch (error) {
    if (error.message === "Configuration_Required") {
      return res.status(401).json({
        success: false,
        message:
          "Configuration Zoho CRM requise. Veuillez configurer via /api/zoho/configure",
        requiresConfiguration: true,
      });
    }

    if (error.message === "Token_Refresh_Failed") {
      return res.status(401).json({
        success: false,
        message: "Échec du rafraîchissement du token. Veuillez reconfigurer.",
        requiresConfiguration: true,
      });
    }

    console.error(
      "Erreur lors de la récupération des messages:",
      error.message
    );
    res.status(error.response?.status || 500).json({
      success: false,
      message: error.message || "Erreur lors de la récupération des messages",
      error: error.response?.data || error.message,
      details: error.response?.data,
    });
  }
};

const getDeals = async (req, res) => {
  console.log("Début de getDeals");
  try {
    checkAuth(req);

    const { page = 1, per_page = 11 } = req.query;

    const data = await executeWithTokenRefresh(req, res, async (token) => {
      const response = await axios.get(`${config.ZOHO_API_URL}/Deals`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
        params: {
          page: parseInt(page),
          per_page: parseInt(per_page)
        }
      });

      // Calculer le nombre total de pages
      const totalRecords = response.data.info.count;
      const totalPages = Math.ceil(totalRecords / parseInt(per_page));

      return {
        data: response.data.data,
        info: {
          ...response.data.info,
          total_pages: totalPages
        }
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    if (error.message === "Configuration Zoho CRM requise") {
      return res.status(401).json({
        success: false,
        message:
          "Configuration Zoho CRM requise. Utilisez /api/zoho/configure pour configurer.",
      });
    }
    console.error("Erreur lors de la récupération des deals:", error.message);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération des deals",
    });
  }
};

const getLeads = async (req, res) => {
  console.log("Début de getLeads");
  try {
    checkAuth(req);

    const { page = 1, modifiedSince } = req.query;
    const pageSize = 250; // Taille maximale autorisée par Zoho
    const delayBetweenRequests = 500; // 0.5 seconde de délai entre les requêtes

    // Fonction pour ajouter un délai
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const result = await executeWithTokenRefresh(req, res, async (token) => {
      let allLeads = [];
      let currentPage = parseInt(page);
      let hasMoreRecords = true;
      let totalRecords = 0;

      while (hasMoreRecords) {
        // console.log(`Récupération de la page ${currentPage}...`);

        // Construire la requête de base
        const baseURL = "https://www.zohoapis.com/crm/v2.1/Deals";
        let params = {
          fields: "Deal_Name,Stage,Pipeline,Amount,Closing_Date,Account_Name,Description,Email_1,Phone,Owner,Created_Time,Modified_Time,Last_Activity_Time,Next_Step,Probability,Lead_Source,Type,Expected_Revenue,Overall_Sales_Duration,Stage_Duration",
          page: currentPage,
          per_page: pageSize
        };

        // Ajouter le filtre de date si spécifié
        if (modifiedSince) {
          params.criteria = `(Modified_Time:greater_than:${modifiedSince})`;
        }

        // console.log("Paramètres de requête:", params);

        const response = await axios.get(baseURL, {
          params: params,
          headers: {
            Authorization: `Zoho-oauthtoken ${token}`,
            "Content-Type": "application/json",
          },
        });

        // Ajouter les leads de la page courante au tableau
        if (response.data.data && Array.isArray(response.data.data)) {
          allLeads = allLeads.concat(response.data.data);
          totalRecords = response.data.info.count;
          hasMoreRecords = response.data.info.more_records;
          
          // console.log(`Page ${currentPage} récupérée: ${response.data.data.length} leads`);
          // console.log(`Total des leads récupérés jusqu'à présent: ${allLeads.length}`);
        }

        // Si on a plus de pages, on arrête
        if (!hasMoreRecords) {
          console.log("Plus de pages à récupérer");
          break;
        }

        // Incrémenter la page
        currentPage++;

        // Ajouter un délai entre les requêtes pour éviter le rate limit
        if (hasMoreRecords) {
          // console.log(`Attente de ${delayBetweenRequests}ms avant la prochaine requête...`);
          await delay(delayBetweenRequests);
        }
      }

      // Calculer le nombre total de pages
      const totalPages = Math.ceil(totalRecords / pageSize);

      return {
        data: allLeads,
        info: {
          total_records: totalRecords,
          total_pages: totalPages,
          current_page: currentPage - 1,
          per_page: pageSize
        }
      };
    });

    // console.log(`Récupération terminée. Total des leads: ${result.data.length}`);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error("Erreur complète getLeads:", error.message);
    console.error("Détails de l'erreur:", {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
    });

    if (error.message === "Configuration_Required") {
      return res.status(401).json({
        success: false,
        message: "Configuration Zoho CRM requise. Veuillez configurer via /api/zoho/configure",
        requiresConfiguration: true,
      });
    }

    if (error.message === "Token_Refresh_Failed") {
      return res.status(401).json({
        success: false,
        message: "Échec du rafraîchissement du token. Veuillez reconfigurer.",
        requiresConfiguration: true,
      });
    }

    res.status(error.response?.status || 500).json({
      success: false,
      message: "Erreur lors de la récupération des deals",
      error: error.message,
      details: error.response?.data,
    });
  }
};

const saveLeads = async (req, res) => {
  console.log("Début de saveLeads");
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
        try {
          const newLead = new LeadModel.Lead({
            name: lead.Full_Name,
            company: lead.Company,
            email: lead.Email_1,
            phone: lead.Phone,
            status: lead.Status || "new",
            source: "Zoho CRM",
            userId: lead.userId, // Ajout de l'ID utilisateur si disponible
            gigId: lead.gigId, // Ajout de l'ID du gig si disponible
            companyId: req.body?.companyId, // Ajout du companyId
          });
          return await newLead.save();
        } catch (saveError) {
          console.error("Erreur lors de la sauvegarde du lead:", saveError);
          return null;
        }
      })
    );

    // Filtrer les leads null (ceux qui n'ont pas pu être sauvegardés)
    const successfulLeads = savedLeads.filter(lead => lead !== null);
    console.log("Leads sauvegardés:", successfulLeads.length);
    
    res.status(201).json({ 
      success: true, 
      data: successfulLeads,
      total: leads.length,
      saved: successfulLeads.length,
      failed: leads.length - successfulLeads.length
    });
  } catch (error) {
    console.error("Erreur lors de la sauvegarde des leads:", error);
    res.status(500).json({ 
      success: false, 
      message: "Erreur lors de la sauvegarde des leads",
      error: error.message 
    });
  }
};

const getDealsCount = async (req, res) => {
  console.log("Début de getDealsCount");
  try {
    checkAuth(req);

    const data = await executeWithTokenRefresh(req, res, async (token) => {
      const pageSize = 200;
      const batchLimit = 10;
      let allDeals = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const batchPromises = [];
        for (let i = 0; i < batchLimit; i++) {
          batchPromises.push(
            axios.get("https://www.zohoapis.com/crm/v2/Deals", {
              headers: { Authorization: `Zoho-oauthtoken ${token}` },
              params: { page: page++, per_page: pageSize },
            })
          );
        }

        const batchResults = await Promise.all(batchPromises);
        batchResults.forEach((result) => {
          allDeals = allDeals.concat(result.data.data);
        });

        hasMore = batchResults[batchResults.length - 1].data.info.more_records;
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }

      return { count: allDeals.length, deals: allDeals };
    });

    res.json({ success: true, count: data.count, deals: data.deals });
  } catch (error) {
    if (error.message === "Configuration Zoho CRM requise") {
      return res.status(401).json({
        success: false,
        message:
          "Configuration Zoho CRM requise. Utilisez /api/zoho/configure pour configurer.",
      });
    }
    console.error("Erreur lors de la récupération des deals:", error.message);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération des deals",
    });
  }
};

const getContacts = async (req, res) => {
  console.log("Début de getContacts");
  try {
    checkAuth(req);

    const data = await executeWithTokenRefresh(req, res, async (token) => {
      const response = await axios.get(`${config.ZOHO_API_URL}/Contacts`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
      });
      return response.data;
    });

    res.json({ success: true, data });
  } catch (error) {
    if (error.message === "Configuration Zoho CRM requise") {
      return res.status(401).json({
        success: false,
        message:
          "Configuration Zoho CRM requise. Utilisez /api/zoho/configure pour configurer.",
      });
    }
    console.error(
      "Erreur lors de la récupération des contacts:",
      error.message
    );
    res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération des contacts",
    });
  }
};

const sendMessageToConversation = async (req, res) => {
  console.log("Début de sendMessageToConversation");
  const { id } = req.params;
  const { text } = req.body;

  try {
    checkAuth(req);

    if (!id || !text) {
      return res.status(400).json({ message: "id et message sont requis" });
    }

    const data = await executeWithTokenRefresh(req, res, async (token) => {
      // Récupérer le portal name
      const portalName = await getSalesIQPortalName(token);
      console.log("Portal name récupéré:", portalName);

      const response = await axios.post(
        `https://salesiq.zoho.com/api/v2/${portalName}/conversations/${id}/messages`,
        { text },
        {
          headers: {
            Authorization: `Zoho-oauthtoken ${token}`,
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    });

    res.json({ success: true, data });
  } catch (error) {
    if (error.message === "Configuration_Required") {
      return res.status(401).json({
        success: false,
        message:
          "Configuration Zoho CRM requise. Veuillez configurer via /api/zoho/configure",
        requiresConfiguration: true,
      });
    }

    if (error.message === "Token_Refresh_Failed") {
      return res.status(401).json({
        success: false,
        message: "Échec du rafraîchissement du token. Veuillez reconfigurer.",
        requiresConfiguration: true,
      });
    }

    console.error("Erreur lors de l'envoi du message:", error.message);
    res.status(500).json({
      success: false,
      message: "Erreur lors de l'envoi du message",
      error: error.message,
    });
  }
};

// Ajouter cette fonction utilitaire pour obtenir l'ID du compte mail
const getZohoMailAccountId = async (token) => {
  try {
    const response = await axios.get("https://mail.zoho.com/api/accounts", {
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (response.data && response.data.data && response.data.data.length > 0) {
      return response.data.data[0].accountId;
    }
    throw new Error("Aucun compte mail trouvé");
  } catch (error) {
    console.error("Erreur lors de la récupération de l'ID du compte:", error);
    throw error;
  }
};

// Modifier la fonction getFolders
const getFolders = async (req, res) => {
  console.log("Début de getFolders");
  try {
    checkAuth(req);

    const data = await executeWithTokenRefresh(req, res, async (token) => {
      // Obtenir l'ID du compte dynamiquement
      const accountId = await getZohoMailAccountId(token);

      const response = await axios.get(
        `https://mail.zoho.com/api/accounts/${accountId}/folders`,
        {
          headers: {
            Authorization: `Zoho-oauthtoken ${token}`,
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error("Erreur lors de la récupération des dossiers:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération des dossiers",
      error: error.message,
    });
  }
};

// Modifier la fonction getSentEmails
const getSentEmails = async (req, res) => {
  console.log("Début de getSentEmails");
  try {
    checkAuth(req);

    const data = await executeWithTokenRefresh(req, res, async (token) => {
      // Obtenir l'ID du compte dynamiquement
      const accountId = await getZohoMailAccountId(token);

      // Récupérer les dossiers
      const foldersResponse = await axios.get(
        `https://mail.zoho.com/api/accounts/${accountId}/folders`,
        {
          headers: {
            Authorization: `Zoho-oauthtoken ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      // Trouver le dossier "Sent"
      const sentFolder = foldersResponse.data.data.find(
        (folder) => folder.folderType === "Sent"
      );

      if (!sentFolder) {
        throw new Error('Dossier "Sent" non trouvé');
      }

      // Récupérer les emails
      const emailsResponse = await axios.get(
        `https://mail.zoho.com/api/accounts/${accountId}/messages/view`,
        {
          params: {
            folderId: sentFolder.folderId,
          },
          headers: {
            Authorization: `Zoho-oauthtoken ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      return emailsResponse.data;
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error("Erreur lors de la récupération des emails envoyés:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération des emails envoyés",
      error: error.message,
    });
  }
};

// Modifier la fonction getInboxEmails
const getInboxEmails = async (req, res) => {
  console.log("Début de getInboxEmails");
  try {
    checkAuth(req);

    const data = await executeWithTokenRefresh(req, res, async (token) => {
      // Obtenir l'ID du compte dynamiquement
      const accountId = await getZohoMailAccountId(token);

      // Récupérer les dossiers
      const foldersResponse = await axios.get(
        `https://mail.zoho.com/api/accounts/${accountId}/folders`,
        {
          headers: {
            Authorization: `Zoho-oauthtoken ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      // Trouver le dossier "Inbox"
      const inboxFolder = foldersResponse.data.data.find(
        (folder) => folder.folderType === "Inbox"
      );

      if (!inboxFolder) {
        throw new Error('Dossier "Inbox" non trouvé');
      }

      // Récupérer les emails
      const emailsResponse = await axios.get(
        `https://mail.zoho.com/api/accounts/${accountId}/messages/view`,
        {
          params: {
            folderId: inboxFolder.folderId,
          },
          headers: {
            Authorization: `Zoho-oauthtoken ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      return emailsResponse.data;
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error(
      "Erreur lors de la récupération des emails de la boîte de réception:",
      error
    );
    res.status(500).json({
      success: false,
      message:
        "Erreur lors de la récupération des emails de la boîte de réception",
      error: error.message,
    });
  }
};

// Modifier la fonction getArchivedEmails
const getArchivedEmails = async (req, res) => {
  console.log("Début de getArchivedEmails");
  try {
    checkAuth(req);

    const data = await executeWithTokenRefresh(req, res, async (token) => {
      // Obtenir l'ID du compte dynamiquement
      const accountId = await getZohoMailAccountId(token);

      // Récupérer les dossiers
      const foldersResponse = await axios.get(
        `https://mail.zoho.com/api/accounts/${accountId}/folders`,
        {
          headers: {
            Authorization: `Zoho-oauthtoken ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      // Trouver le dossier "Archive"
      const archiveFolder = foldersResponse.data.data.find(
        (folder) => folder.folderName === "Archive"
      );

      if (!archiveFolder) {
        throw new Error('Dossier "Archive" non trouvé');
      }

      // Récupérer les emails
      const emailsResponse = await axios.get(
        `https://mail.zoho.com/api/accounts/${accountId}/messages/view`,
        {
          params: {
            folderId: archiveFolder.folderId,
          },
          headers: {
            Authorization: `Zoho-oauthtoken ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      return emailsResponse.data;
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error("Erreur lors de la récupération des emails archivés:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération des emails archivés",
      error: error.message,
    });
  }
};

const updateLead = async (req, res) => {
  console.log("Début de updateLead");
  const { id } = req.params;
  const leadData = req.body;

  try {
    checkAuth(req);

    if (!id) {
      return res.status(400).json({ message: "ID du lead est requis" });
    }

    const data = await executeWithTokenRefresh(req, res, async (token) => {
      // Préparer les données pour Zoho CRM
      const zohoData = {
        data: [leadData],
      };

      const response = await axios.put(
        `${config.ZOHO_API_URL}/Deals/${id}`,
        zohoData,
        {
          headers: {
            Authorization: `Zoho-oauthtoken ${token}`,
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    });

    // Mettre à jour également dans la base de données locale si nécessaire
    try {
      const updateData = {
        name: leadData.Full_Name,
        company: leadData.Company,
        email: leadData.Email_1,
        phone: leadData.Phone,
        status: leadData.Status || "updated",
        updatedAt: new Date()
      };

      // Utiliser findOneAndUpdate directement avec l'ID Zoho
      const updatedLead = await LeadModel.Lead.findOneAndUpdate(
        { id: leadData.id }, // Rechercher par l'ID Zoho
        {
          $set: {
            ...leadData,
            updatedAt: new Date()
          }
        },
        { 
          new: true,
          upsert: true // Créer le document s'il n'existe pas
        }
      );
      
      if (updatedLead) {
        console.log(`Lead ${leadData.id} traité avec succès. ID Zoho: ${updatedLead.id}`);
        return updatedLead;
      }
    } catch (updateError) {
      console.error(`Erreur lors du traitement du lead ${leadData.id}:`, updateError);
      throw updateError; // Propager l'erreur pour la gestion dans le bloc catch parent
    }

    res.json({ success: true, data });
  } catch (error) {
    if (error.message === "Configuration Zoho CRM requise") {
      return res.status(401).json({
        success: false,
        message:
          "Configuration Zoho CRM requise. Utilisez /api/zoho/configure pour configurer.",
      });
    }
    console.error("Erreur lors de la mise à jour du lead:", error.message);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la mise à jour du lead",
      error: error.message
    });
  }
};

const getLeadsByPipeline = async (req, res) => {
  console.log("Début de getLeadsByPipeline");
  try {
    checkAuth(req);
    const { pipeline, page = 1 } = req.query;

    if (!pipeline) {
      return res.status(400).json({
        success: false,
        message: "Le paramètre pipeline est requis"
      });
    }

    const result = await executeWithTokenRefresh(req, res, async (token) => {
      // Construire la requête de base
      const baseURL = "https://www.zohoapis.com/crm/v2.1/Deals";
      let url = baseURL;
      let params = {
        fields: "Deal_Name,Stage,Pipeline,Amount,Closing_Date,Account_Name,Description,Email_1,Phone,Owner,Created_Time,Modified_Time,Last_Activity_Time,Next_Step,Probability,Lead_Source,Type,Expected_Revenue,Overall_Sales_Duration,Stage_Duration,Email_1",
        page: parseInt(page),
        criteria: `(Pipeline:equals:${encodeURIComponent(pipeline)})`
      };

      console.log("URL de requête:", url);
      console.log("Paramètres:", params);

      const response = await axios.get(url, {
        params: params,
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          "Content-Type": "application/json",
        },
      });

      // Calculer le nombre total de pages
      const totalRecords = response.data.info.count;
      const totalPages = Math.ceil(totalRecords / 200); // Utilisation de la valeur par défaut de 200

      return {
        data: response.data.data,
        info: {
          ...response.data.info,
          total_pages: totalPages
        }
      };
    });

    console.log("Résultat de la recherche:", JSON.stringify(result, null, 2));
    res.json({ success: true, data: result });
  } catch (error) {
    console.error("Erreur getLeadsByPipeline:", error.message);
    console.error("Détails de l'erreur:", {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
    });

    if (error.message === "Configuration_Required") {
      return res.status(401).json({
        success: false,
        message: "Configuration Zoho CRM requise. Veuillez configurer via /api/zoho/configure",
        requiresConfiguration: true,
      });
    }

    if (error.message === "Token_Refresh_Failed") {
      return res.status(401).json({
        success: false,
        message: "Échec du rafraîchissement du token. Veuillez reconfigurer.",
        requiresConfiguration: true,
      });
    }

    res.status(error.response?.status || 500).json({
      success: false,
      message: "Erreur lors de la récupération des leads du pipeline",
      error: error.message,
      details: error.response?.data,
    });
  }
};

const getTokenWithCredentials = async (req, res) => {
  console.log("Début de getTokenWithCredentials");
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: "Email et mot de passe requis",
    });
  }

  try {
    // Vérifier les identifiants dans votre système
    // Par exemple, vérifier si l'email et le mot de passe correspondent à un utilisateur autorisé
    // Cette partie dépendra de votre implémentation spécifique

    // Si l'authentification est réussie, générer un token pour l'utilisateur
    // Pour un test Postman, vous pouvez utiliser l'approche suivante:

    if (email === "admin@exemple.com" && password === "motdepasse123") {
      // Utiliser le refresh token stocké pour obtenir un nouveau token
      // ou rediriger vers l'authentification OAuth si nécessaire
      try {
        // Option 1: Utiliser un refresh token déjà stocké
        const refreshTokenStored = req.app.locals.refreshToken;
        if (refreshTokenStored) {
          const response = await axios.post(config.ZOHO_TOKEN_URL, null, {
            params: {
              refresh_token: refreshTokenStored,
              client_id: config.ZOHO_CLIENT_ID,
              client_secret: config.ZOHO_CLIENT_SECRET,
              grant_type: "refresh_token",
            },
          });

          return res.json({
            success: true,
            data: {
              access_token: response.data.access_token,
            },
          });
        }

        // Option 2: Si pas de refresh token, informer qu'une authentification OAuth est nécessaire
        return res.status(401).json({
          success: false,
          message: "Authentification OAuth nécessaire",
        });
      } catch (error) {
        console.error(
          "Erreur lors de la génération du token:",
          error.response?.data || error.message
        );
        res
          .status(500)
          .json({ message: "Erreur lors de la génération du token" });
      }
    } else {
      console.error("Authentification échouée");
      res.status(401).json({
        success: false,
        message: "Authentification échouée",
      });
    }
  } catch (error) {
    console.error(
      "Erreur lors de la vérification des identifiants:",
      error.response?.data || error.message
    );
    res.status(401).json({
      success: false,
      message: "Erreur lors de la vérification des identifiants",
    });
  }
};

const configureZohoCRM = async (req, res) => {
  console.log("Début de configureZohoCRM");
  const { userId, companyId, refreshToken, clientId, clientSecret } = req.body;

  if (!userId || !companyId || !refreshToken || !clientId || !clientSecret) {
    return res.status(400).json({
      success: false,
      message: "userId, companyId, refreshToken, clientId et clientSecret sont requis",
    });
  }

  try {
    console.log("Vérification de la connexion à MongoDB...");
    if (mongoose.connection.readyState !== 1) {
      throw new Error("La connexion MongoDB n'est pas établie");
    }

    console.log("Test de la validité des credentials Zoho...");
    console.log("URL:", config.ZOHO_TOKEN_URL);
    console.log("Paramètres:", {
      refresh_token: refreshToken.substring(0, 10) + "...",
      client_id: clientId.substring(0, 10) + "...",
      client_secret: clientSecret.substring(0, 10) + "...",
      grant_type: "refresh_token",
    });

    const response = await axios.post(config.ZOHO_TOKEN_URL, null, {
      params: {
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
      },
    });

    console.log("Réponse Zoho:", response.data);

    if (!response.data || !response.data.access_token) {
      console.error("Réponse Zoho invalide:", response.data);
      throw new Error(
        "Token non reçu de Zoho. Réponse: " + JSON.stringify(response.data)
      );
    }

    const accessToken = response.data.access_token;
    console.log("Token initial obtenu avec succès");

    // Supprimer l'ancienne configuration pour cet utilisateur et cette entreprise
    console.log("Suppression de l'ancienne configuration...");
    await ZohoConfig.deleteMany({ userId, companyId });

    // Créer la nouvelle configuration
    console.log("Sauvegarde de la nouvelle configuration...");
    const zohoConfig = new ZohoConfig({
      userId,
      companyId,
      refreshToken,
      clientId,
      clientSecret,
      lastUpdated: new Date(),
    });

    await zohoConfig.save();
    console.log("Configuration sauvegardée avec succès, ID:", zohoConfig.id);

    // Vérifier que la configuration a bien été sauvegardée
    const savedConfig = await ZohoConfig.findById(zohoConfig.id);
    if (!savedConfig) {
      throw new Error("La configuration n'a pas été sauvegardée correctement");
    }

    res.json({
      success: true,
      message: "Configuration Zoho CRM mise à jour avec succès",
      accessToken: accessToken,
      configId: zohoConfig.id,
    });
  } catch (error) {
    console.error("Erreur détaillée lors de la configuration:", {
      message: error.message,
      response: error.response?.data,
      stack: error.stack,
    });

    let errorMessage = "Erreur lors de la configuration de Zoho CRM";
    if (error.response?.data) {
      errorMessage += `: ${JSON.stringify(error.response.data)}`;
    }

    res.status(500).json({
      success: false,
      message: errorMessage,
      error: error.message,
      details: error.response?.data || null,
    });
  }
};

const disconnect = async (req, res) => {
  console.log("Début de disconnect");
  try {
    // Vérifier si l'utilisateur est authentifié
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: "Utilisateur non authentifié",
      });
    }

    // Révoquer le token d'accès actuel si présent
    const accessToken = req.headers.authorization?.split(" ")[1];
    if (accessToken) {
      try {
        await axios.post(
          "https://accounts.zoho.com/oauth/v2/token/revoke",
          null,
          {
            params: {
              token: accessToken,
            },
          }
        );
      } catch (revokeError) {
        console.warn(
          "Erreur lors de la révocation du token:",
          revokeError.message
        );
      }
    }

    // Supprimer la configuration de l'utilisateur de la base de données
    await ZohoConfig.deleteMany({ userId: req.user.id });

    res.json({
      success: true,
      message: "Déconnexion réussie",
    });
  } catch (error) {
    console.error("Erreur lors de la déconnexion:", error.message);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la déconnexion",
    });
  }
};

const checkConfiguration = async (req, res) => {
  try {
    // Vérifier si l'utilisateur est authentifié
    if (!req.userId) {
      return res.status(401).json({
        success: false,
        message: "Utilisateur non authentifié",
      });
    }

    const config = await ZohoConfig.findOne({ userId: req.usrId }).sort({ lastUpdated: -1 });
    if (!config) {
      return res.status(404).json({
        success: false,
        message: "Aucune configuration trouvée",
        requiresConfiguration: true,
      });
    }

    // Tester si la configuration est valide
    const response = await axios.post(config.ZOHO_TOKEN_URL, null, {
      params: {
        refresh_token: config.refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "refresh_token",
      },
    });

    if (!response.data.access_token) {
      throw new Error("Configuration invalide");
    }

    res.json({
      success: true,
      message: "Configuration valide",
      lastUpdated: config.lastUpdated,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Erreur lors de la vérification de la configuration",
      error: error.message,
    });
  }
};

const getPipelines = async (req, res) => {
  console.log("Début de getPipelines");
  try {
    checkAuth(req);

    // D'abord, récupérer le layout ID
    const layoutData = await executeWithTokenRefresh(
      req,
      res,
      async (token) => {
        const response = await axios.get(
          `https://www.zohoapis.com/crm/v2.1/settings/layouts`,
          {
            params: {
              module: "Deals",
            },
            headers: {
              Authorization: `Zoho-oauthtoken ${token}`,
              "Content-Type": "application/json",
            },
          }
        );
        return response.data;
      }
    );

    console.log("Réponse layout data:", JSON.stringify(layoutData, null, 2));

    // Vérifier la structure de la réponse et trouver le layout ID
    let layoutId;
    if (
      layoutData.success &&
      layoutData.data &&
      layoutData.data.layouts &&
      layoutData.data.layouts.length > 0
    ) {
      layoutId = layoutData.data.layouts[0].id;
    } else {
      throw new Error(
        "Structure de réponse layout invalide: " + JSON.stringify(layoutData)
      );
    }

    if (!layoutId) {
      throw new Error("Layout ID non trouvé dans la réponse");
    }

    console.log("Layout ID trouvé:", layoutId);

    // Récupérer les pipelines avec le layout ID
    const pipelinesData = await executeWithTokenRefresh(
      req,
      res,
      async (token) => {
        const response = await axios.get(
          `https://www.zohoapis.com/crm/v2.1/settings/pipeline`,
          {
            params: {
              layout_id: layoutId,
            },
            headers: {
              Authorization: `Zoho-oauthtoken ${token}`,
              "Content-Type": "application/json",
            },
          }
        );
        return response.data;
      }
    );

    console.log("Réponse pipelines:", JSON.stringify(pipelinesData, null, 2));

    res.json({
      success: true,
      data: {
        layoutId: layoutId,
        pipelines: pipelinesData.data || pipelinesData,
      },
    });
  } catch (error) {
    console.error("Erreur détaillée getPipelines:", {
      message: error.message,
      response: error.response?.data,
      stack: error.stack,
    });

    if (error.message === "Configuration Zoho CRM requise") {
      return res.status(401).json({
        success: false,
        message:
          "Configuration Zoho CRM requise. Utilisez /api/zoho/configure pour configurer.",
      });
    }

    res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération des pipelines",
      error: error.message,
      details: error.response?.data,
    });
  }
};

const archiveEmail = async (req, res) => {
  console.log("Début de archiveEmail");
  const { id } = req.params;

  try {
    checkAuth(req);

    if (!id) {
      return res.status(400).json({ message: "ID de l'email requis" });
    }

    const data = await executeWithTokenRefresh(req, res, async (token) => {
      // Obtenir l'ID du compte dynamiquement
      const accountId = await getZohoMailAccountId(token);

      console.log("AccountId:", accountId);
      console.log("EmailId:", id);

      const response = await axios.put(
        `https://mail.zoho.com/api/accounts/${accountId}/updatemessage`,
        {
          mode: "archiveMails",
          messageId: [id], // L'API attend un tableau d'IDs
        },
        {
          headers: {
            Authorization: `Zoho-oauthtoken ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        }
      );

      console.log("Réponse de l'API:", response.data);
      return response.data;
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error("Erreur détaillée:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      message: "Erreur lors de l'archivage de l'email",
      error: error.message,
      details: error.response?.data,
    });
  }
};

const syncAllLeads = async (req, res) => {
  console.log("=== DÉBUT DE LA SYNCHRONISATION DES LEADS ===");
  console.log("Informations de la requête:", {
    userId: req.lead?.userId,
    gigId: req.lead?.gigId,
    
    authToken: req.headers.authorization ? "Présent" : "Absent",
    cookies: req.cookies,
    body: req.body,
    headers: {
      ...req.headers,
      authorization: req.headers.authorization ? "Présent" : "Absent"
    }
  });

  // Vérifier et définir les valeurs par défaut
  const userId = req.body?.userId;
  const gigId = req.body?.gigId;

  console.log("Valeurs finales utilisées:", {
    userId,
    gigId,
    source: {
      fromBody: req.body?.userId,
      fromBodyGig: req.body?.gigId
    }
  });

  try {
    checkAuth(req);
    let totalSaved = 0;
    let totalFailed = 0;
    let failedLeads = []; // Pour stocker les détails des échecs

    // Récupérer et sauvegarder les leads page par page
    const result = await executeWithTokenRefresh(req, res, async (token) => {
      let currentPage = 1;
      let hasMoreRecords = true;
      let totalRecords = 0;
      const pageSize = 250;
      const delayBetweenRequests = 500;

      console.log("Début de la récupération des leads depuis Zoho");
      console.log("Configuration:", {
        pageSize,
        delayBetweenRequests,
        baseURL: "https://www.zohoapis.com/crm/v2.1/Deals"
      });

      while (hasMoreRecords) {
        console.log(`\nTraitement de la page ${currentPage}...`);
        
        const baseURL = "https://www.zohoapis.com/crm/v2.1/Deals";
        const params = {
          fields: "Deal_Name,Stage,Pipeline,Email_1,Phone,Last_Activity_Time,Activity_Tag",
          page: currentPage,
          per_page: pageSize
        };

        console.log("Paramètres de la requête:", params);

        const response = await axios.get(baseURL, {
          params: params,
          headers: {
            Authorization: `Zoho-oauthtoken ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (response.data.data && Array.isArray(response.data.data)) {
          const leadsInPage = response.data.data.length;
          console.log(`Leads récupérés dans cette page: ${leadsInPage}`);
          
          // Sauvegarder immédiatement les leads de cette page
          console.log(`\nSauvegarde des ${leadsInPage} leads de la page ${currentPage}...`);
          
          const savedLeads = await Promise.all(
            response.data.data.map(async (lead, index) => {
              try {
                console.log(`Traitement du lead ${index + 1}/${leadsInPage} de la page ${currentPage}`);
                
                // Nettoyer et préparer les données du lead
                const leadData = {
                  userId: userId,
                  gigId: gigId,
                  companyId: req.body?.companyId,
                  Deal_Name: lead.Deal_Name,
                  Stage: lead.Stage,
                  Phone: lead.Phone,
                  Pipeline: lead.Pipeline,
                  Last_Activity_Time: lead.Last_Activity_Time,
                  Activity_Tag: lead.Activity_Tag,
                  id: lead.id,
                  refreshToken: req.headers.authorization?.split(" ")[1]
                };

                console.log("Données du lead avant traitement:", {
                  originalLead: {
                    userId: lead.userId,
                    gigId: lead.gigId
                  },
                  finalLeadData: {
                    userId: leadData.userId,
                    gigId: leadData.gigId
                  },
                  source: {
                    fromFunction: { userId, gigId },
                    fromBody: req.body
                  }
                });

                // Gérer le cas où l'email est dans Deal_Name
                if (!lead.Email_1 && lead.Deal_Name && lead.Deal_Name.includes('@')) {
                  console.log(`Email trouvé dans Deal_Name: ${lead.Deal_Name}`);
                  leadData.Email_1 = lead.Deal_Name;
                  // Extraire le nom du Deal_Name si possible
                  const nameParts = lead.Deal_Name.split('@')[0];
                  if (nameParts) {
                    leadData.Deal_Name = nameParts.replace(/[._]/g, ' ');
                  }
                } else {
                  leadData.Email_1 = lead.Email_1 || 'no-email@placeholder.com'; // Valeur par défaut si Email_1 est null
                }

                console.log("Données nettoyées du lead:", {
                  Deal_Name: leadData.Deal_Name,
                  Stage: leadData.Stage,
                  Email_1: leadData.Email_1,
                  Pipeline: leadData.Pipeline,
                  Phone: leadData.Phone,
                  Last_Activity_Time: leadData.Last_Activity_Time,
                  Activity_Tag: leadData.Activity_Tag,
                  userId: leadData.userId,
                  gigId: leadData.gigId,
                  id: leadData.id
                });

                // Vérifier si un lead avec le même ID Zoho existe déjà
                if (leadData.id) {
                  try {
                    // Première tentative de sauvegarde
                    let updatedLead = await LeadModel.Lead.findOneAndUpdate(
                      { id: leadData.id },
                      {
                        $set: {
                          ...leadData,
                          userId: userId,
                          gigId: gigId,
                          updatedAt: new Date()
                        }
                      },
                      { 
                        new: true,
                        upsert: true
                      }
                    );

                    // Fonction de vérification réutilisable
                    const verifyLead = async (leadId, maxAttempts = 5) => {
                      let attempts = 0;
                      let savedLead = null;
                      
                      while (!savedLead && attempts < maxAttempts) {
                        try {
                          savedLead = await LeadModel.Lead.findOne({ id: leadId });
                          if (!savedLead) {
                            attempts++;
                            if (attempts < maxAttempts) {
                              const delay = Math.min(1000, 200 * Math.pow(2, attempts - 1));
                              console.log(`Tentative ${attempts + 1}/${maxAttempts} pour le lead ${leadId}, attente de ${delay}ms...`);
                              await new Promise(resolve => setTimeout(resolve, delay));
                            }
                          }
                        } catch (findError) {
                          console.error(`Erreur lors de la tentative ${attempts + 1} pour le lead ${leadId}:`, findError);
                          attempts++;
                          if (attempts < maxAttempts) {
                            await new Promise(resolve => setTimeout(resolve, 500));
                          }
                        }
                      }
                      return { savedLead, attempts };
                    };

                    // Première série de vérifications
                    let { savedLead, attempts } = await verifyLead(leadData.id);

                    // Si le lead n'est pas trouvé, essayer une deuxième fois avec un délai plus long
                    if (!savedLead) {
                      console.log(`Première série de vérifications échouée pour le lead ${leadData.id}, tentative de récupération...`);
                      await new Promise(resolve => setTimeout(resolve, 2000));
                      
                      // Deuxième tentative de sauvegarde
                      updatedLead = await LeadModel.Lead.findOneAndUpdate(
                        { id: leadData.id },
                        {
                          $set: {
                            ...leadData,
                            updatedAt: new Date()
                          }
                        },
                        { 
                          new: true,
                          upsert: true
                        }
                      );

                      // Deuxième série de vérifications
                      const secondCheck = await verifyLead(leadData.id, 3);
                      savedLead = secondCheck.savedLead;
                      attempts += secondCheck.attempts;
                    }

                    // Vérification finale
                    if (!savedLead) {
                      console.log(`Tentative de vérification finale pour le lead ${leadData.id}...`);
                      await new Promise(resolve => setTimeout(resolve, 3000));
                      
                      // Dernière tentative de sauvegarde
                      updatedLead = await LeadModel.Lead.findOneAndUpdate(
                        { id: leadData.id },
                        {
                          $set: {
                            ...leadData,
                            updatedAt: new Date()
                          }
                        },
                        { 
                          new: true,
                          upsert: true
                        }
                      );

                      // Vérification finale
                      savedLead = await LeadModel.Lead.findOne({ id: leadData.id });
                    }

                    if (savedLead) {
                      console.log(`Lead ${leadData.id} traité avec succès après ${attempts} tentatives. ID Zoho: ${savedLead.id}`);
                      totalSaved++;
                      return savedLead;
                    } else {
                      console.error(`Lead ${leadData.id} non trouvé après toutes les tentatives de vérification`);
                      totalFailed++;
                      failedLeads.push({
                        page: currentPage,
                        index: index + 1,
                        leadId: leadData.id,
                        error: `Lead non trouvé après ${attempts} tentatives de vérification`,
                        data: leadData,
                        attempts: attempts,
                        lastAttempt: new Date(),
                        status: 'failed'
                      });

                      // Sauvegarde d'urgence dans une collection séparée
                      try {
                        const emergencyLead = new LeadModel.Lead({
                          ...leadData,
                          status: 'emergency_save',
                          saveAttempts: attempts,
                          lastAttempt: new Date()
                        });
                        await emergencyLead.save();
                        console.log(`Lead ${leadData.id} sauvegardé en mode urgence`);
                      } catch (emergencyError) {
                        console.error(`Échec de la sauvegarde d'urgence pour le lead ${leadData.id}:`, emergencyError);
                      }

                      return null;
                    }
                  } catch (updateError) {
                    console.error(`Erreur lors du traitement du lead ${leadData.id}:`, updateError);
                    totalFailed++;
                    failedLeads.push({
                      page: currentPage,
                      index: index + 1,
                      leadId: leadData.id,
                      error: updateError.message,
                      data: leadData,
                      timestamp: new Date(),
                      status: 'error'
                    });
                    return null;
                  }
                }

                // Si on arrive ici, c'est qu'il n'y a pas d'ID Zoho
                try {
                  const newLead = new LeadModel.Lead(leadData);
                  const savedLead = await newLead.save();
                  
                  // Attendre un court instant pour laisser le temps à MongoDB de finaliser l'opération
                  await new Promise(resolve => setTimeout(resolve, 200));
                  
                  // Vérifier que le lead a bien été sauvegardé avec plusieurs tentatives
                  let verifiedLead = null;
                  let attempts = 0;
                  const maxAttempts = 5; // Augmentation du nombre de tentatives
                  
                  while (!verifiedLead && attempts < maxAttempts) {
                    try {
                      verifiedLead = await LeadModel.Lead.findOne({ _id: savedLead._id });
                      if (!verifiedLead) {
                        attempts++;
                        if (attempts < maxAttempts) {
                          // Délai exponentiel entre les tentatives
                          const delay = Math.min(1000, 200 * Math.pow(2, attempts - 1));
                          console.log(`Tentative ${attempts + 1}/${maxAttempts} pour le nouveau lead, attente de ${delay}ms...`);
                          await new Promise(resolve => setTimeout(resolve, delay));
                        }
                      }
                    } catch (findError) {
                      console.error(`Erreur lors de la tentative ${attempts + 1} pour le nouveau lead:`, findError);
                      attempts++;
                      if (attempts < maxAttempts) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                      }
                    }
                  }

                  if (verifiedLead) {
                    console.log(`Nouveau lead sauvegardé avec succès. ID Zoho: ${savedLead.id}`);
                    totalSaved++;
                    return savedLead;
                  } else {
                    // Dernière tentative avec un délai plus long
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    const finalCheck = await LeadModel.Lead.findOne({ _id: savedLead._id });
                    
                    if (finalCheck) {
                      console.log(`Nouveau lead trouvé lors de la vérification finale. ID Zoho: ${finalCheck.id}`);
                      totalSaved++;
                      return finalCheck;
                    } else {
                      console.error(`Nouveau lead non trouvé après ${maxAttempts} tentatives et vérification finale`);
                      totalFailed++;
                      failedLeads.push({
                        page: currentPage,
                        index: index + 1,
                        leadId: leadData.id,
                        error: `Nouveau lead non trouvé après ${maxAttempts} tentatives et vérification finale`,
                        data: leadData,
                        attempts: attempts,
                        lastAttempt: new Date()
                      });
                      return null;
                    }
                  }
                } catch (saveError) {
                  console.error(`Erreur lors de la sauvegarde du nouveau lead:`, saveError);
                  totalFailed++;
                  failedLeads.push({
                    page: currentPage,
                    index: index + 1,
                    leadId: leadData.id,
                    error: saveError.message,
                    data: leadData,
                    timestamp: new Date()
                  });
                  return null;
                }
              } catch (saveError) {
                console.error(`Erreur lors de la sauvegarde du lead ${index + 1} de la page ${currentPage}:`, {
                  error: saveError.message,
                  leadData: {
                    Deal_Name: lead.Deal_Name,
                    Email_1: lead.Email_1,
                    id: lead.id
                  }
                });
                
                // Enregistrer les détails de l'échec
                failedLeads.push({
                  page: currentPage,
                  index: index + 1,
                  leadId: lead.id,
                  error: saveError.message,
                  data: {
                    Deal_Name: lead.Deal_Name,
                    Email_1: lead.Email_1
                  }
                });
                
                totalFailed++;
                return null;
              }
            })
          );

          console.log(`\nRésumé de la page ${currentPage}:`, {
            totalLeads: leadsInPage,
            saved: savedLeads.filter(lead => lead !== null).length,
            failed: savedLeads.filter(lead => lead === null).length
          });

          totalRecords = response.data.info.count;
          hasMoreRecords = response.data.info.more_records;
          
          console.log("Statut actuel:", {
            totalSaved,
            totalFailed,
            totalRecords,
            hasMoreRecords
          });
        }

        if (!hasMoreRecords) {
          console.log("Plus de pages à traiter");
          break;
        }

        currentPage++;
        console.log(`Attente de ${delayBetweenRequests}ms avant la prochaine requête...`);
        await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
      }

      console.log("\n=== RÉSUMÉ FINAL DE LA SYNCHRONISATION ===");
      console.log("Statistiques:", {
        totalSaved,
        totalFailed,
        totalRecords,
        pagesProcessed: currentPage - 1
      });

      // Afficher les détails des échecs
      if (failedLeads.length > 0) {
        console.log("\nDétails des leads qui ont échoué:", failedLeads);
      }

      // À la fin de la synchronisation, vérifier le nombre réel de leads dans la base de données
      const actualLeadCount = await LeadModel.Lead.countDocuments();
      console.log("\n=== VÉRIFICATION FINALE ===");
      console.log("Nombre réel de leads dans la base de données:", actualLeadCount);
      console.log("Nombre déclaré de leads sauvegardés:", totalSaved);
      console.log("Différence:", totalSaved - actualLeadCount);

      return {
        info: {
          total_records: totalRecords,
          total_pages: currentPage - 1,
          total_saved: totalSaved,
          total_failed: totalFailed,
          actual_lead_count: actualLeadCount,
          failed_leads: failedLeads
        }
      };
    });

    res.status(200).json({
      success: true,
      data: {
        sync_info: result.info
      }
    });
  } catch (error) {
    console.error("\n=== ERREUR LORS DE LA SYNCHRONISATION ===");
    console.error("Détails de l'erreur:", {
      message: error.message,
      stack: error.stack,
      response: error.response?.data
    });
    
    if (error.message === "Configuration_Required") {
      return res.status(401).json({
        success: false,
        message: "Configuration Zoho CRM requise. Veuillez configurer via /api/zoho/configure",
        requiresConfiguration: true,
      });
    }

    if (error.message === "Token_Refresh_Failed") {
      return res.status(401).json({
        success: false,
        message: "Échec du rafraîchissement du token. Veuillez reconfigurer.",
        requiresConfiguration: true,
      });
    }

    res.status(500).json({
      success: false,
      message: "Erreur lors de la synchronisation des leads",
      error: error.message
    });
  }
};

const getZohoConfigById = async (req, res) => {
  try {
    const { id } = req.params;
    const { companyId } = req.query;
    
    console.log("userId reçu:", id);
    console.log("companyId reçu:", companyId);
    console.log("Type de userId:", typeof id);
    console.log("Longueur de userId:", id.length);
    
    // Vérifier si l'ID est un ObjectId valide
    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.log("userId invalide détecté");
      return res.status(400).json({
        success: false,
        message: "userId invalide",
        details: {
          receivedId: id,
          expectedFormat: "24 caractères hexadécimaux"
        }
      });
    }

    // Vérifier si companyId est fourni et valide
    if (!companyId || !mongoose.Types.ObjectId.isValid(companyId)) {
      return res.status(400).json({
        success: false,
        message: "companyId invalide ou manquant",
        details: {
          receivedCompanyId: companyId,
          expectedFormat: "24 caractères hexadécimaux"
        }
      });
    }

    // Rechercher la configuration par userId et companyId
    const config = await ZohoConfig.findOne({ userId: id, companyId }).sort({ lastUpdated: -1 });
    console.log("Configuration trouvée:", config ? "Oui" : "Non");
    
    if (!config) {
      return res.status(404).json({
        success: false,
        message: "Configuration non trouvée pour cet utilisateur et cette entreprise",
        details: {
          searchedUserId: id,
          searchedCompanyId: companyId
        }
      });
    }

    // Ne pas renvoyer les informations sensibles
    const safeConfig = {
      id: config._id,
      userId: config.userId,
      companyId: config.companyId,
      lastUpdated: config.lastUpdated
    };

    res.json({
      success: true,
      data: safeConfig
    });
  } catch (error) {
    console.error("Erreur lors de la récupération de la configuration:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération de la configuration",
      error: error.message
    });
  }
};

const getAllZohoConfigs = async (req, res) => {
  try {
    const { companyId } = req.query;
    
    // Construire la requête en fonction de la présence de companyId
    const query = companyId ? { companyId } : {};
    
    const configs = await ZohoConfig.find(query).sort({ lastUpdated: -1 });
    
    // Ne pas renvoyer les informations sensibles
    const safeConfigs = configs.map(config => ({
      id: config._id,
      userId: config.userId,
      companyId: config.companyId,
      lastUpdated: config.lastUpdated
    }));

    res.json({
      success: true,
      data: safeConfigs,
      count: safeConfigs.length
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des configurations:", error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération des configurations",
      error: error.message
    });
  }
};

module.exports = {
  refreshToken,
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
  getSalesIQPortalName,
  syncAllLeads,
  getZohoConfigById,
  getAllZohoConfigs
};
