const corsMiddleware = (req, res, next) => {
  const allowedOrigins = [
    'http://localhost:5180',
    'https://v25-prod.harx.ai',
    'https://prod-api-dash-calls.harx.ai',
    'https://v25.harx.ai'
  ];

  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }

  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-channel, Accept, Origin, X-Requested-With, Cache-Control');
  res.header('Access-Control-Allow-Credentials', 'true');

  next();
};

const handleCorsError = (err, req, res, next) => {
  if (err.name === 'CorsError') {
    return res.status(403).json({ error: 'CORS policy violation' });
  }
  next(err);
};

module.exports = { corsMiddleware, handleCorsError };

