const ZohoConfig = require('../models/ZohoConfig');
const { config } = require('../config/env');
const zohoService = require('../services/zoho.service');
/**
 * Middleware pour gérer automatiquement le refresh des tokens Zoho
 * Vérifie si le token est expiré et le rafraîchit automatiquement
 */
const zohoTokenMiddleware = async (req, res, next) => {
  try {
    // The Zoho session belongs to this browser, not to the database record.
    const browserToken = String(req.get('x-zoho-token') || '').trim();
    if (browserToken) {
      const authHeader = req.headers.authorization || '';
      const raw = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      const [gigId, userId] = raw.split(':');
      req.zohoAccessToken = browserToken;
      req.zohoConfig = {
        api_domain: String(req.get('x-zoho-api-domain') || '').trim(),
        crmModule: 'Deals',
      };
      req.userId = userId || '';
      req.gigId = gigId || '';
      return next();
    }

    // Extraire userId de l'Authorization header (format: gigId:userId)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(419).json({
        success: false,
        message: "Token d'autorisation requis"
      });
    }

    const token = authHeader.split(' ')[1];
    const [gigId, userId] = token.split(':');
    if (!userId) {
      return res.status(419).json({
        success: false,
        message: "Format d'autorisation invalide"
      });
    }

    // Récupérer la configuration Zoho de l'utilisateur
    const zohoConfig = await ZohoConfig.findOne({ userId }).sort({ updated_at: -1});
    
    if (!zohoConfig) {
      return res.status(449).json({
        success: false,
        message: "Configuration Zoho non trouvée"
      });
    }

    // Vérifier si le token est expiré (avec une marge de sécurité de 5 minutes)
    const tokenExpiryTime = new Date(zohoConfig.updated_at).getTime() + (zohoConfig.expires_in * 1000);
    const currentTime = Date.now();
    const safetyMargin = 5 * 60 * 1000; //5 minutes

    if (currentTime >= (tokenExpiryTime - safetyMargin)) {
      console.log(`Token expiré pour l'utilisateur ${userId}, rafraîchissement en cours...`);
      
      try {
        const tokenData = await zohoService.refreshAccessToken({
          refreshToken: zohoConfig.refresh_token,
          clientId: zohoConfig.client_id,
          clientSecret: zohoConfig.client_secret,
          apiDomain: zohoConfig.api_domain,
          fallbackClientId: config.ZOHO_CLIENT_ID,
          fallbackClientSecret: config.ZOHO_CLIENT_SECRET,
          fallbackTokenUrl: config.ZOHO_TOKEN_URL,
        });

        await ZohoConfig.findOneAndUpdate(
          { userId },
          {
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token || zohoConfig.refresh_token,
            expires_in: tokenData.expires_in,
            client_id: tokenData.clientId || zohoConfig.client_id,
            client_secret: tokenData.clientSecret || zohoConfig.client_secret,
            ...(tokenData.api_domain ? { api_domain: tokenData.api_domain } : {}),
            updated_at: new Date()
          }
        );

        console.log(`Token rafraîchi avec succès pour l'utilisateur ${userId}`);

        if (tokenData.api_domain) {
          zohoConfig.api_domain = tokenData.api_domain;
        }
        req.zohoAccessToken = tokenData.access_token;
        
      } catch (refreshError) {    
        console.error(`Erreur lors du rafraîchissement du token pour l'utilisateur ${userId}:`, refreshError.zohoError || refreshError.message);

        if (refreshError.zohoError === 'invalid_grant') {
          await ZohoConfig.deleteMany({ userId });
          return res.status(401).json({
            success: false,
            message: "Refresh token expiré. Veuillez vous reconnecter à Zoho.",
            requiresReconnection: true
          });
        }
        
        return res.status(500).json({
          success: false,
          message: "Erreur lors du rafraîchissement du token. Déconnectez puis reconnectez Zoho."
        });
      }
    } else {
      // Token encore valide
      req.zohoAccessToken = zohoConfig.access_token;
    }

    // Ajouter les informations Zoho à la requête
    req.zohoConfig = zohoConfig;
    req.userId = userId;
    req.gigId = gigId;

    next();
  } catch (error) {
    console.error('Erreur dans zohoTokenMiddleware:', error);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la vérification du token Zoho"
    });
  }
};

/**
 * Middleware pour les routes qui nécessitent une configuration Zoho
 */
const requireZohoConfig = async (req, res, next) => {
  if (!req.zohoConfig) {
    return res.status(401).json({
      success: false,
      message: "Configuration Zoho requise"
    });
  }
  next();
};

module.exports = {
  zohoTokenMiddleware,
  requireZohoConfig
}; 