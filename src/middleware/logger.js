const logger = (req, res, next) => {
  const start = Date.now();
  
  // Log de la requête entrante
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  console.log('Headers:', {
    origin: req.headers.origin,
    'user-agent': req.headers['user-agent'],
    authorization: req.headers.authorization ? 'Present' : 'Missing'
  });

  // Intercepter la réponse
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - start;
    
    // Log de la réponse
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
    
    // Log des headers CORS
    console.log('CORS Headers:', { 
      'access-control-allow-origin': res.getHeader('Access-Control-Allow-Origin'),
      'access-control-allow-methods': res.getHeader('Access-Control-Allow-Methods'),
      'access-control-allow-headers': res.getHeader('Access-Control-Allow-Headers')
    });

    originalSend.call(this, data);
  };

  next();
};

module.exports = logger; 