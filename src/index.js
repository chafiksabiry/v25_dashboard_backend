const initializeZohoConfig = require('./controllers/zoho').initializeZohoConfig;

// Import du scheduler Zoho
const { startZohoTokenScheduler } = require(./schedulers/zohoTokenScheduler');

// ... autres imports et configurations ...

// Initialiser la configuration Zoho au démarrage
app.listen(port, async () => {
  console.log(`Serveur démarré sur le port ${port}`);
  await initializeZohoConfig(app);
});

// Démarrer le scheduler de refresh automatique des tokens Zoho
startZohoTokenScheduler(); 