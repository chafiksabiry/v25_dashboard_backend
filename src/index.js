const initializeZohoConfig = require('./controllers/zoho').initializeZohoConfig;

// ... autres imports et configurations ...

// Initialiser la configuration Zoho au démarrage
app.listen(port, async () => {
  console.log(`Serveur démarré sur le port ${port}`);
  await initializeZohoConfig(app);
}); 