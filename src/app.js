const express = require('express');
const cors = require('cors');
const { config } = require('./config/env');
const { connectDB } = require('./config/database');
const { errorHandler } = require('./middleware/error');
const axios = require('axios');
const zohoRoutes = require('./routes/zoho');

// Route imports
const auth = require('./routes/auth');
const integrations = require('./routes/integrations');
const leads = require('./routes/leads');
const agents = require('./routes/agents');
const calls = require('./routes/calls');
const settings = require('./routes/settings');
const analytics = require('./routes/analytics');
const dashboard = require('./routes/dashboard');

const Chat = require("./models/Chat");

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


async function fetchAndStoreChats() {
  console.log("Récupération automatique des chats depuis Zoho SalesIQ...");

  const url = `https://salesiq.zoho.com/api/v1/${process.env.ZOHO_SALESIQ_PORTAL}/chats`;

  try {
    const accessToken = await getValidAccessToken();

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    const chats = response.data.data || [];
    console.log("Réponse de l'API Zoho SalesIQ:", response.data);


    for (const chat of chats) {
      let existingChat = await Chat.findOne({ chatId: chat.chat_id });

      if (!existingChat) {
        const newChat = new Chat({
          chatId: chat.chat_id,
          question: chat.question,
          chatInitiatedUrl: chat.chat_initiated_url,
          departmentId: chat.department_id,
          departmentName: chat.department_name,
          endTime: new Date(parseInt(chat.end_time)),
          crmInfo: chat.crm_info,
          embedName: chat.embed_name,
          visitorEmail: chat.visitor_email,
          notesAvailable: chat.notes_available,
          visitorName: chat.visitor_name,
          countryCode: chat.country_code,
          embedId: chat.embed_id,
          chatInitiatedTime: new Date(parseInt(chat.chatinitiated_time)),
          visitorIp: chat.visitor_ip,
          missedTime: isNaN(parseInt(chat.missed_time)) ? null : new Date(parseInt(chat.missed_time)),
        });

        await newChat.save();
      }
    }

    console.log("Chats enregistrés avec succès !");
  } catch (error) {
    console.error("Erreur lors de l'enregistrement des chats :", error);
  }
}


// Connect to database
connectDB()
  .then(() => {
    fetchAndStoreChats(); // Lancement automatique après la connexion
  })
  .catch((err) => console.error("Erreur lors de la connexion à la base de données :", err));


const app = express();

// Body parser
app.use(express.json());

// Enable CORS
app.use(cors({
  origin: '*',
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'x-channel']
}));

// Mount routers
app.use('/api/auth', auth);
app.use('/api/integrations', integrations);
app.use('/api/leads', leads);
app.use('/api/agents', agents);
app.use('/api/calls', calls);
app.use('/api/settings', settings);
app.use('/api/analytics', analytics);
app.use('/api/dashboard', dashboard);
app.use('/api/zoho', zohoRoutes);


// app.use('/', (req, res) => {
//   res.status(200).json({ message: 'Testing route is working!' });
// });

// Error handler
app.use(errorHandler);

const PORT = config.PORT;

app.listen(PORT, () => {
  console.log(`Server running in ${config.NODE_ENV} mode on port ${PORT}`);
});