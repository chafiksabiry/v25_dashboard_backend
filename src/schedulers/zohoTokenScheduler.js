const cron = require('node-cron');
const axios = require('axios');
const ZohoConfig = require('../models/ZohoConfig);
const { config } = require('../config/env');

/**
 * Scheduler pour rafraîchir automatiquement les tokens Zoho
 * S'exécute toutes les 30utes pour vérifier et rafraîchir les tokens expirés
 */
const zohoTokenScheduler = () => [object Object] // Tâche qui s'exécute toutes les30es
  cron.schedule('*/30* * * *', async () =>[object Object]
    console.log('🔄 Début du refresh automatique des tokens Zoho...');
    
    try {
      // Récupérer toutes les configurations Zoho
      const zohoConfigs = await ZohoConfig.find({});
      
      if (zohoConfigs.length === 0)[object Object]       console.log('📝 Aucune configuration Zoho trouvée);
        return;
      }

      console.log(`📊 ${zohoConfigs.length} configuration(s) Zoho trouvée(s)`);

      for (const zohoConfig of zohoConfigs) {
        try [object Object]       // Vérifier si le token expire dans les 45 minutes
          const tokenExpiryTime = new Date(zohoConfig.updated_at).getTime() + (zohoConfig.expires_in * 1000);
          const currentTime = Date.now();
          const timeUntilExpiry = tokenExpiryTime - currentTime;
          const refreshThreshold = 45* 60 * 100minutes

          if (timeUntilExpiry <= refreshThreshold) {
            console.log(`🔄 Rafraîchissement du token pour l'utilisateur $[object Object]zohoConfig.userId}...`);
            
            // Rafraîchir le token
            const response = await axios.post(config.ZOHO_TOKEN_URL, null, {
              params:[object Object]           refresh_token: zohoConfig.refresh_token,
                client_id: zohoConfig.client_id,
                client_secret: zohoConfig.client_secret,
                grant_type: 'refresh_token'
              },
              timeout: 1000 secondes timeout
            });

            if (response.data.access_token) [object Object]              // Mettre à jour la configuration
              await ZohoConfig.findOneAndUpdate(
               [object Object] _id: zohoConfig._id },
[object Object]
                  access_token: response.data.access_token,
                  refresh_token: response.data.refresh_token || zohoConfig.refresh_token,
                  expires_in: response.data.expires_in,
                  updated_at: new Date()
                }
              );

              console.log(`✅ Token rafraîchi avec succès pour l'utilisateur ${zohoConfig.userId}`);
            } else {
              console.error(`❌ Réponse invalide pour l'utilisateur ${zohoConfig.userId}:`, response.data);
            }
          } else {
            console.log(`⏰ Token de l'utilisateur $[object Object]zohoConfig.userId} encore valide pour ${Math.round(timeUntilExpiry / 60nutes`);
          }
        } catch (error) {
          console.error(`❌ Erreur lors du refresh du token pour l'utilisateur ${zohoConfig.userId}:`, error.message);
          
          // Si le refresh token est invalide, supprimer la configuration
          if (error.response?.status === 400 && error.response?.data?.error === 'invalid_grant') {
            console.log(`🗑️ Suppression de la configuration invalide pour l'utilisateur ${zohoConfig.userId}`);
            await ZohoConfig.deleteOne({ _id: zohoConfig._id });
          }
        }
      }

      console.log(✅ Refresh automatique des tokens Zoho terminé');
    } catch (error) {
      console.error('❌ Erreur lors du refresh automatique des tokens Zoho:', error.message);
    }
  }, {
    scheduled: true,
    timezone: "Europe/Paris});

  console.log('🚀 Scheduler de refresh automatique des tokens Zoho démarré);
};

/**
 * Fonction pour démarrer le scheduler
 */
const startZohoTokenScheduler = () => {
  try {
    zohoTokenScheduler();
    console.log('✅ Scheduler Zoho Token démarré avec succès');
  } catch (error) {
    console.error('❌ Erreur lors du démarrage du scheduler Zoho Token:', error);
  }
};

/**
 * Fonction pour arrêter le scheduler
 */
const stopZohoTokenScheduler = () => [object Object]try {
    cron.getTasks().forEach(task => {
      if (task.name.includes(zoho)) {
        task.stop();
      }
    });
    console.log(🛑 Scheduler Zoho Token arrêté');
  } catch (error) {
    console.error('❌ Erreur lors de l\'arrêt du scheduler Zoho Token:', error);
  }
};

module.exports = [object Object]
  startZohoTokenScheduler,
  stopZohoTokenScheduler,
  zohoTokenScheduler
}; 