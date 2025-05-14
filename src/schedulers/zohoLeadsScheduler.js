const cron = require('node-cron');
const ZohoConfig = require('../models/ZohoConfig');
const { Lead } = require('../models/Lead');
const axios = require('axios');
const { config } = require('../config/env');

// Fonction pour nettoyer les données du lead
const cleanLeadData = (lead) => {
  const cleanedData = {};
  for (const [key, value] of Object.entries(lead)) {
    if (!key.startsWith('$')) {
      // Gestion spéciale pour le champ Tag
      if (key === 'Tag' && Array.isArray(value)) {
        cleanedData[key] = value.map(tag => tag.name).join(', ');
      } else {
        cleanedData[key] = value;
      }
    }
  }
  return cleanedData;
};

// Fonction pour rafraîchir le token Zoho
const refreshToken = async (zohoConfig) => {
  try {
    const response = await axios.post(config.ZOHO_TOKEN_URL, null, {
      params: {
        refresh_token: zohoConfig.refreshToken,
        client_id: zohoConfig.clientId,
        client_secret: zohoConfig.clientSecret,
        grant_type: "refresh_token",
      },
    });

    if (!response.data.access_token) {
      throw new Error("Token non reçu dans la réponse");
    }

    return response.data.access_token;
  } catch (error) {
    console.error(`Erreur lors du rafraîchissement du token pour l'utilisateur ${zohoConfig.userId}:`, error.message);
    throw error;
  }
};

// Fonction pour récupérer les leads d'un utilisateur
const fetchUserLeads = async (zohoConfig) => {
  try {    
    // Rafraîchir le token
    const accessToken = await refreshToken(zohoConfig);

    let totalLeadsProcessed = 0;
    let page = 1;
    let hasMoreRecords = true;
    const pageSize = 1000; // Augmentation à 1000 leads par page

    // Boucle pour récupérer toutes les pages de leads
    while (hasMoreRecords) {      
      const response = await axios.get('https://www.zohoapis.com/crm/v2.1/Deals', {
        headers: { 
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          "Content-Type": "application/json"
        },
        params: {
          fields: "Deal_Name,Stage,Email_1,Pipeline,Telephony, Last_Activity_Time,Phone",
          page: page,
          per_page: pageSize
        }
      });

      if (!response.data.data) {
        throw new Error("Aucune donnée reçue de Zoho CRM");
      }

      const leads = response.data.data;
      
      // Récupérer tous les IDs des leads existants en une seule requête
      const leadIds = leads.map(lead => lead.id);
      const existingLeads = await Lead.find({
        refreshToken: zohoConfig.refreshToken,
        id: { $in: leadIds }
      }).select('id');
      
      const existingLeadIds = new Set(existingLeads.map(lead => lead.id));
      
      // Filtrer les nouveaux leads
      const newLeads = leads.filter(lead => !existingLeadIds.has(lead.id));
      
      // Traiter les nouveaux leads en parallèle par lots de 10
      const batchSize = 10;
      for (let i = 0; i < newLeads.length; i += batchSize) {
        const batch = newLeads.slice(i, i + batchSize);
        await Promise.all(batch.map(async (lead) => {
          try {
            if (!lead.id) return;

            const leadData = {
              userId: zohoConfig.userId,
              refreshToken: zohoConfig.refreshToken,
              ...cleanLeadData(lead)
            };


            await Lead.findOneAndUpdate(
              { 
                refreshToken: zohoConfig.refreshToken,
                id: lead.id
              },
              { $set: leadData },
              { upsert: true, new: true }
            );

            totalLeadsProcessed++;
          } catch (dbError) {
            console.error(`Erreur lors de la mise à jour du lead ${lead.id}:`, dbError.message);
          }
        }));
      }

      // Vérifier s'il y a plus de pages
      hasMoreRecords = response.data.info?.more_records || false;
      if (hasMoreRecords) {
        page++;
      }
    }

    return totalLeadsProcessed;
  } catch (error) {
    console.error(`\nErreur lors de la récupération des leads pour l'utilisateur ${zohoConfig.userId}:`, error.message);
    throw error;
  }
};

// Fonction principale pour récupérer les leads de tous les utilisateurs
const fetchAllUsersLeads = async () => {
  try {
    const zohoConfigs = await ZohoConfig.find();
    
    if (!zohoConfigs.length) {
      return;
    }

    // Traiter les utilisateurs en parallèle
    await Promise.all(zohoConfigs.map(config => fetchUserLeads(config)));
  } catch (error) {
    console.error("\nErreur lors de la récupération des leads:", error.message);
  }
};

// Démarrer le scheduler
const startZohoLeadsScheduler = () => {
  // Exécuter une seule fois au démarrage
  fetchAllUsersLeads();
};

module.exports = {
  startZohoLeadsScheduler,
  fetchAllUsersLeads // Exporté pour les tests
}; 