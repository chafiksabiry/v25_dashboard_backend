const express = require('express');
const cors = require('cors');
const { config } = require('./config/env');
const { connectDB } = require('./config/database');
const { errorHandler } = require('./middleware/error');
const { OAuth2Client } = require('google-auth-library');
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
const speechToText = require('./routes/speech-to-text');
const vertex = require('./routes/vertex');
const zoho = require('./routes/zoho');








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
app.use('/api/speechToText', speechToText);
app.use('/api/vertex', vertex);
app.use('/api/zoho', zoho);


// app.use('/', (req, res) => {
//   res.status(200).json({ message: 'Testing route is working!' });
// });

// Error handler
app.use(errorHandler);

const PORT = config.PORT;

app.listen(PORT, () => {
  console.log(`Server running in ${config.NODE_ENV} mode on port ${PORT}`);
});