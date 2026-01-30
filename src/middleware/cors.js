const cors = require('cors');

const corsOptions = {
  origin: true, // Allow all origins for now to fix CORS issues
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