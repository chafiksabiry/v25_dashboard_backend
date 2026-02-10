const cors = require('cors');

const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      'https://v25.harx.ai', 
      'https://api-dashboard.harx.ai', 
      'https://v25-preprod.harx.ai',
      'https://preprod-api-dashboard.harx.ai',
      'https://preprod-comp-orchestrator.harx.ai',
      'https://comp-orchestrator.harx.ai',
      'http://localhost:5183', 
      'http://localhost:3000', 
      'http://localhost:5173', 
      'http://localhost:3001'
    ];
    
    // Permettre les requêtes sans origine (comme les requêtes de test)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      // Also allow any subdomain of harx.ai for development/preprod
      if (origin && origin.endsWith('.harx.ai')) {
        console.log('CORS allowing harx.ai subdomain:', origin);
        callback(null, true);
      } else {
        console.log('CORS blocked origin:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-channel',
    'Accept',
    'Origin',
    'X-Requested-With',
    'Cache-Control'
  ],
  exposedHeaders: ['Content-Length', 'X-Requested-With'],
  preflightContinue: false,
  optionsSuccessStatus: 204
};

const corsMiddleware = cors(corsOptions);

// Middleware pour gérer les erreurs CORS
const handleCorsError = (err, req, res, next) => {
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      message: 'CORS:Origin not allowed',
      origin: req.headers.origin
    });
  }
  next(err);
};

module.exports = {
  corsMiddleware,
  handleCorsError,
  corsOptions
}; 