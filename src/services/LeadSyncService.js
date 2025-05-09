const { startLeadsSync } = require('../controllers/zoho');

class LeadSyncService {
  constructor(app) {
    this.app = app;
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) {
      console.log('La synchronisation des leads est déjà en cours');
      return;
    }

    console.log('Démarrage du service de synchronisation des leads...');
    startLeadsSync(this.app);
    this.isRunning = true;
  }

  stop() {
    if (!this.isRunning) {
      console.log('La synchronisation des leads n\'est pas en cours');
      return;
    }

    // Note: Dans une implémentation plus complète, nous devrions
    // stocker l'ID de l'intervalle et le nettoyer ici
    this.isRunning = false;
    console.log('Service de synchronisation des leads arrêté');
  }
}

module.exports = { LeadSyncService }; 