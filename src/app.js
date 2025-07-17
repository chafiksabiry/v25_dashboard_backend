const express = require('express');
const mongoose = require('mongoose');
const { config } = require('./config/env');
const { connectDB } = require('./config/database');
const { errorHandler } = require('./middleware/error');
const { corsMiddleware, handleCorsError } = require('./middleware/cors');
const logger = require('./middleware/logger');
const { OAuth2Client } = require('google-auth-library');
const axios = require('axios');

// Route imports
const auth = require('./routes/auth');
const integrations = require('./routes/integrations');
const leads = require('./routes/leads');
const agents = require('./routes/agents');
const calls = require('./routes/calls');
const settings = require('./routes/settings');
const analytics = require('./routes/analytics');
const dashboard = require('./routes/dashboard');
const speechToText = require('./routes/speech-to-text');
const vertex = require('./routes/vertex');
const zoho = require('./routes/zoho');

// Connect to database
connectDB()
  .catch((err) => console.error("Erreur lors de la connexion à la base de données :", err));

// Démarrer le scheduler Zoho après la connexion à la base de données
mongoose.connection.once('open', () => {
  console.log('Connecté à MongoDB');
});

const app = express();

// Body parser
app.use(express.json());

// Logger middleware (en développement)
if (process.env.NODE_ENV === 'development') {
  app.use(logger);
}

// Configuration CORS personnalisée
app.use(corsMiddleware);

// Middleware pour gérer les preflight requests
app.options('*', corsMiddleware);

// Middleware pour gérer les requêtes OPTIONS
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-channel, Accept, Origin, X-Requested-With, Cache-Control');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.status(204).end();
    return;
  }
  next();
});

// Mount routers
app.use('/api/auth', auth);
app.use('/api/integrations', integrations);
app.use('/api/leads', leads);
app.use('/api/agents', agents);
app.use('/api/calls', calls);
app.use('/api/settings', settings);
app.use('/api/analytics', analytics);
app.use('/api/dashboard', dashboard);
app.use('/api/speechToText', speechToText);
app.use('/api/vertex', vertex);
app.use('/api/zoho', zoho); // Une seule route Zoho

// Middleware pour gérer les erreurs CORS
app.use(handleCorsError);

// Error handler
app.use(errorHandler);

const PORT = config.PORT;

app.listen(PORT, () => {
  console.log(`Server running in ${config.NODE_ENV} mode on port ${PORT}`);
});

module.exports = app;