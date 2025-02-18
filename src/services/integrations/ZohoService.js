const axios = require("axios");
require("dotenv").config();

const {
  ZOHO_CLIENT_ID,
  ZOHO_CLIENT_SECRET,
  ZOHO_REFRESH_TOKEN,
  ZOHO_API_DOMAIN,
} = process.env;
const refreshEndpoint = "https://accounts.zoho.com/oauth/v2/token";

let accessToken = null;

const refreshAccessToken = async () => {
  try {
    const response = await axios.post(refreshEndpoint, null, {
      params: {
        refresh_token: ZOHO_REFRESH_TOKEN,
        client_id: ZOHO_CLIENT_ID,
        client_secret: ZOHO_CLIENT_SECRET,
        grant_type: "refresh_token",
      },
    });

    accessToken = response.data.access_token;
    console.log("🔄 Token rafraîchi avec succès !");
    return accessToken;
  } catch (error) {
    console.error(
      "❌ Erreur lors du rafraîchissement du token : ",
      error.response ? error.response.data : error.message
    );
    throw new Error("Échec du rafraîchissement du token");
  }
};

const getLeads = async (accessToken) => { // Ajoutez le paramètre accessToken
  try {
    const response = await axios.get(`${ZOHO_API_DOMAIN}/crm/v2/Leads`, {
      headers: { Authorization: `Bearer ${accessToken}` } // Utilisez le token dynamique
    });
    return response.data;
  } catch (error) {
    // Gestion des erreurs...
  }
};

module.exports = { getLeads };
